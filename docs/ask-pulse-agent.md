# Ask Pulse Agent — Architecture & Design Rationale

This document explains how the Ask Pulse AI agent is built, when it calls tools, how errors are handled, and what happens when a tool call fails. It is written for engineers who need to reason about the system, not just use it.

---

## What Ask Pulse Is

Ask Pulse is a conversational AI agent that answers scheduling questions and proposes shift assignments for hospital staff. It is not a chatbot over static data — it queries a live database on every relevant question, so answers reflect the current state of the schedule.

The agent is built with [Mastra](https://mastra.ai), runs on GPT-4o, and communicates with the frontend over Server-Sent Events (SSE).

---

## System Architecture

```
Browser (AskPulseDrawer)
    │  POST /api/shift-agent { message, threadId, history }
    ▼
Express API Route (src/api/shift-agent.ts)
    │  shiftAgent.stream(message, { memory, resourceId, threadId })
    ▼
Mastra Agent (src/mastra/agents/shift-agent.ts)
    │  routes to tools based on message intent
    ▼
Tools (src/mastra/tools/*.ts)
    │  Prisma ORM queries against SQLite
    ▼
Database (pulse.db)
```

The client receives a stream of typed SSE events: `delta` (text chunks), `tool-call`, `tool-result`, `error`, and `done`. The client renders them as they arrive.

---

## Tool Call Decision: When the Agent Calls a Tool

The agent decides whether to call a tool — and which one — based on the user's message. This decision is not random; the system prompt contains explicit routing rules that map question patterns to specific tools.

### Routing Rules (from system prompt)

| User Intent | Tool Called |
|-------------|-------------|
| Gaps, understaffed, coverage short | `getCoverageGaps` |
| Overloaded, burnout, over hours | `getOverloadedStaff` |
| Fill shifts, recommend, assign staff | `recommendShifts` |
| Score, rate, evaluate a schedule | `scoreSchedule` |
| Time off, sick call, who is blocked | `getBlockedDates` |
| Propose custom assignment | `proposeShifts` |
| List shifts for a period | `getShifts` |
| List staff, certifications, roles | `getStaff` |
| Patient census, current load | `getPatients` |
| Rules, constraints, policy | `getSchedulingRules` |

The routing is intentional. Each tool is scoped to a single query type and returns only what the agent needs for that question. This prevents the agent from pulling broad data and fabricating answers from it.

### Why Not One Big Query?

A single "get everything" tool is tempting but has compounding problems:

- **Token cost**: Large results consume context, reducing the agent's reasoning quality.
- **Hallucination risk**: The agent fills gaps in data it received rather than admitting it needs to re-query. Narrow tool results leave fewer gaps.
- **Debugging**: When something is wrong, a focused tool isolates the failure. An omnibus query leaves you guessing which field was bad.

### Date Context Injection

Before streaming starts, the API endpoint injects the current date and week boundaries (Monday–Sunday) into the system prompt. This ensures the agent interprets relative phrases like "this week" or "tomorrow" consistently without calling a date tool.

```typescript
// src/api/shift-agent.ts:68
const { weekStart, weekEnd, weekStartISO, weekEndISO } = currentWeekUTC(HOSPITAL_TIMEZONE)
```

---

## Tool Call Sequencing

The Mastra framework executes tool calls sequentially within a single stream. The agent loop is:

1. Agent reads message + conversation history
2. Agent decides to call a tool or generate a final response
3. If tool: execute tool, receive result, loop back to step 2
4. If response: stream text to client

**There is no parallelism between tool calls.** The agent calls one tool, reads the result, then decides whether to call another. This is a deliberate constraint: parallel tool calls would require the agent to reason about partial results from multiple in-flight queries, which increases the chance of inconsistent answers (e.g., staffing data from one snapshot, shift data from another).

### Multi-Tool Sequences

For a question like "fill the ICU gaps next week," the agent typically calls:

1. `getCoverageGaps` — identify which shifts are short
2. `getSchedulingRules` — load rest hour and limit constraints  
3. `recommendShifts` — find eligible staff, score assignments, create a proposal

Each call feeds context into the next. The agent cannot skip step 1 and invent gaps — the system prompt instructs it to always call the relevant tool rather than reason from memory.

---

## Concurrency Implications

### Agent-to-Database Concurrency

Each tool call opens a Prisma query against the SQLite database. SQLite serializes writes but allows concurrent reads. Because tools only read (except `confirmShifts` which writes), multiple concurrent agent sessions do not conflict during the query phase.

However, two users running `recommendShifts` simultaneously will receive proposals based on the same snapshot of staff availability. If both confirm their proposals, the second confirmation will create shifts that violate the constraints the first run was evaluated against. The proposal expiry window (24 hours) does not solve this — it only prevents stale proposals from being confirmed.

**Mitigation available but not yet implemented:** Re-validate staff availability at confirm time before writing to the database. The `confirm` endpoint currently trusts the proposal snapshot.

### SSE and Client State

Each browser session holds one SSE stream. The `threadId` scopes conversation memory to a session. Concurrent conversations from different users use different thread IDs and do not share state.

If a user opens two Ask Pulse drawers (two tabs), they produce two independent streams. The agent does not coordinate between them.

---

## Error Handling

### Tool-Level Errors

Every tool wraps its execute function in a try-catch:

```typescript
execute: async ({ context }) => {
  try {
    const data = await prisma.shift.findMany({ ... })
    return { shifts: data }
  } catch (err) {
    console.error('[getShifts] error:', err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
```

On failure, the tool returns `{ error: "..." }` — not a thrown exception. This is critical: Mastra sends tool results back to the agent as structured data. A thrown exception would break the stream. A returned error object gives the agent something to reason about.

**The agent receives the error string and is expected to report it honestly to the user** rather than fabricating an answer. The system prompt does not explicitly handle error responses, which is a known gap — the agent's behavior on tool errors depends on the model's default tendencies.

### API Endpoint Errors

The endpoint distinguishes two failure modes:

**Before the stream starts** (validation, missing API key):
```
HTTP 400 { "error": "..." }
```

**After the stream starts** (mid-stream failure):
```
event: error
data: { "message": "..." }
```

The distinction matters. Once streaming begins, you cannot change the HTTP status code. The client must parse the `error` event and handle it in the stream parser, not in the fetch error handler.

```typescript
// src/api/shift-agent.ts
if (!streamStarted) {
  return res.status(500).json({ error: err.message })
}
res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`)
```

### Client-Side Error Handling

The `AskPulseDrawer` component handles three error categories:

| Scenario | Behavior |
|----------|----------|
| Network failure or non-2xx response | Shows "Something went wrong. Please try again." |
| `error` SSE event received mid-stream | Appends error message to the chat |
| Malformed JSON in SSE data | Silently skipped — the parser continues reading |

Silently skipping malformed JSON is a pragmatic choice: a single bad frame should not destroy an otherwise valid stream. The trade-off is that dropped frames are invisible unless you inspect network traffic.

### Proposal Confirm Errors

The confirm endpoint (`POST /api/shift-agent/confirm`) uses a Prisma `$transaction` to write all shift records atomically:

```typescript
await prisma.$transaction([
  ...assignments.map(a => prisma.shift.create({ data: a })),
  ...assignments.map(a => prisma.shiftChangeLog.create({ data: a })),
  prisma.shiftProposal.update({ where: { id }, data: { status: 'confirmed' } })
])
```

If any write fails, the entire transaction rolls back. No partial state is committed. The proposal status remains unchanged, and the user can retry.

**What this does not protect against:** Two concurrent confirms of overlapping proposals (see Concurrency section above). The transaction prevents half-written shifts, but it does not re-check staffing constraints against the current database state before writing.

---

## What Happens When a Tool Call Fails

The failure path depends on where in the flow the failure occurs.

### Tool Returns `{ error }` (most common)

1. Mastra sends the error object back to the agent as the tool result
2. The agent reads it and generates a response — typically something like "I was unable to retrieve shift data. Try again or check if the database is available."
3. The `tool-result` SSE event is emitted with the error payload
4. The client logs it as a `tool-error` in the console
5. The agent's text response is streamed to the user as a `delta` event
6. The conversation continues normally — the user can ask a follow-up

The stream does **not** terminate on a tool error. The agent handles it inline.

### Unhandled Exception During Tool Execution

If an exception escapes the try-catch (e.g., a programming error in the tool code itself), Mastra catches it at the framework level and:

1. Emits an `error` SSE event
2. The stream ends
3. The client shows the error message in the chat

This is a hard stop. The conversation state is preserved in the thread, but the user must send a new message to continue.

### Stream-Level Failure (network, server crash)

If the SSE connection drops mid-stream, the client's `AbortController` fires (triggered by the drawer closing or navigation). Any in-progress stream is abandoned. There is no automatic retry. The user must re-send their message.

Mastra's thread memory persists the conversation up to the last completed exchange, so a re-sent message has full history — the agent will not repeat itself unnecessarily.

---

## Proposal Lifecycle

The proposal flow is where correctness matters most, because it writes to the database.

```
recommendShifts/proposeShifts tool
    → creates ShiftProposal record (status: pending, expires: +24h)
    → returns proposalId

Agent streams proposalId to client
    → client shows "Review Proposal" button

User clicks → ShiftProposalModal loads via GET /api/shift-agent/proposal/:id
    → validates: exists, not expired, status == pending

User clicks Confirm → POST /api/shift-agent/confirm
    → validates proposal again (not already confirmed)
    → prisma.$transaction creates Shifts + ShiftChangeLogs, updates proposal to confirmed
    → client invalidates shifts cache → calendar re-fetches

User clicks Reject → POST /api/shift-agent/reject
    → updates proposal to rejected
    → no shifts written
```

**Idempotency:** A confirmed proposal cannot be confirmed again — the endpoint checks status before the transaction. Concurrent confirms of the same proposal will both attempt the transaction; one will succeed and the other will receive a 400 "already confirmed" error.

---

## Known Limitations

These are documented honestly in the Q&A page (`src/pulse/pages/QAPage.tsx`):

1. **Single-department recommendation**: `recommendShifts` handles one department per call. Multi-department fills require multiple agent turns.
2. **Hallucination on long threads**: After ~15+ exchanges, the agent occasionally fabricates staff names or hours instead of calling a tool. The system prompt instructs re-querying, but the model does not always follow it.
3. **No constraint re-validation at confirm time**: The proposal is evaluated at creation time. If staff availability changes before confirmation (new sick call, approved time-off), the confirmed shifts may violate constraints.

---

## File Map

| File | Role |
|------|------|
| `src/mastra/agents/shift-agent.ts` | Agent definition, model, system prompt, tool list |
| `src/api/shift-agent.ts` | SSE endpoint, proposal confirm/reject endpoints |
| `src/mastra/tools/*.ts` | 10 tools — one per query type |
| `src/mastra/tools/dateUtils.ts` | Timezone-aware date helpers |
| `src/mastra/scoring/index.ts` | Coverage + wellbeing scoring (used by recommend/propose) |
| `src/pulse/components/AskPulseDrawer.tsx` | Chat UI, SSE parser, tool result rendering |
| `src/pulse/components/ShiftProposalModal.tsx` | Proposal review and confirm UI |
| `prisma/schema.prisma` | Database schema |
