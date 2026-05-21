import "dotenv/config";

import cors from "cors";
import express from "express";
import { z } from "zod";
import { chatAgent } from "../mastra/agents/chat-agent";
import pulseRouter from "./pulse";
import shiftAgentRouter from "./shift-agent";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const chatRequestSchema = z.object({
  message: z.string().min(1),
  threadId: z.string().uuid()
});

app.use(cors());
app.use(express.json());
app.use('/api/pulse', pulseRouter);
app.use('/api/shift-agent', shiftAgentRouter);

app.get("/api/health", (_req, res) => {
  const routes: string[] = [];
  app._router?.stack?.forEach((r: { route?: { path: string; methods: Record<string, boolean> } }) => {
    if (r.route?.path) {
      const methods = Object.keys(r.route.methods).join(",");
      routes.push(`${methods.toUpperCase()} ${r.route.path}`);
    }
  });
  res.json({ ok: true, routes });
});

app.get("/api/threads", async (_req, res) => {
  logServer("GET /api/threads called");
  try {
    const memory = await chatAgent.getMemory();
    if (!memory) {
      res.json({ threads: [] });
      return;
    }

    const result = await memory.listThreads({
      filter: { resourceId: "local-user" },
      perPage: false
    });

    const threads = await Promise.all(
      result.threads.map(async (thread) => {
        const { messages } = await memory.recall({
          threadId: thread.id,
          resourceId: "local-user"
        });
        const firstUser = messages.find((m) => m.role === "user");
        const part = firstUser?.content?.parts?.find(
          (p: { type: string }) => p.type === "text"
        ) as { type: string; text: string } | undefined;
        const title = part?.text?.slice(0, 80) ?? "New conversation";
        return {
          id: thread.id,
          title,
          createdAt: thread.createdAt instanceof Date
            ? thread.createdAt.toISOString()
            : String(thread.createdAt)
        };
      })
    );

    threads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ threads });
  } catch (err) {
    logServer("Failed to fetch thread list.", { error: String(err) });
    res.json({ threads: [] });
  }
});

/**
 * Prints a small timestamped server log.
 *
 * This learning project keeps logging simple so you can see when the route is
 * called, when streaming starts, and where failures happen.
 */
function logServer(message: string, details?: unknown) {
  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`[${timestamp}] ${message}`, details);
    return;
  }

  console.log(`[${timestamp}] ${message}`);
}

/**
 * Converts one named event into an SSE frame.
 *
 * SSE is plain text: every frame has an event name, JSON data, and a blank
 * line that tells the browser/client the event is complete.
 */
function writeSseEvent(
  res: express.Response,
  event: "delta" | "done" | "error",
  data: unknown
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Starts an SSE response and disables buffering/caching for the stream.
 *
 * These headers tell the client to keep the HTTP connection open and process
 * each chunk as it arrives instead of waiting for the full response.
 */
function prepareSseResponse(res: express.Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

/**
 * Validates the incoming chat payload before any streaming headers are sent.
 *
 * Keeping validation before `prepareSseResponse` lets bad requests return a
 * normal JSON 400 response instead of a partially opened SSE stream.
 */
function parseChatRequest(body: unknown): { message: string; threadId: string } {
  const parsed = chatRequestSchema.parse(body);
  return { message: parsed.message.trim(), threadId: parsed.threadId };
}

/**
 * Streams text deltas from the Mastra agent into the active SSE response.
 *
 * Mastra exposes `textStream` as an async iterable, so the backend can forward
 * each model text chunk to the browser immediately.
 */
async function streamAgentResponse(
  message: string,
  threadId: string,
  res: express.Response,
  abortSignal: AbortSignal
) {
  const stream = await chatAgent.stream(
    [{ role: "user", content: message }],
    {
      memory: { thread: threadId, resource: "local-user", options: { lastMessages: 20 } },
      abortSignal
    }
  );
  let chunkCount = 0;

  for await (const text of stream.textStream) {
    chunkCount += 1;
    writeSseEvent(res, "delta", { text });
  }

  logServer("Finished streaming agent response.", { chunkCount });
  writeSseEvent(res, "done", {});
}

app.post("/api/chat", async (req, res) => {
  let streamStarted = false;
  let streamFinished = false;
  const abortController = new AbortController();

  /**
   * Stops the model request if the browser closes the tab or refreshes while
   * the assistant is still generating.
   */
  res.on("close", () => {
    if (streamStarted && !streamFinished) {
      logServer("Client disconnected before stream finished.");
      abortController.abort();
    }
  });

  try {
    logServer("Received chat request.");
    const { message, threadId } = parseChatRequest(req.body);

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing. Add it to .env and restart the dev server.");
    }

    prepareSseResponse(res);
    streamStarted = true;
    logServer("Started SSE stream.", { threadId });

    await streamAgentResponse(message, threadId, res, abortController.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat error";
    logServer("Chat request failed.", { message });

    if (streamStarted) {
      writeSseEvent(res, "error", { message });
    } else {
      res.status(400).json({ error: message });
      return;
    }
  } finally {
    streamFinished = true;
    res.end();
  }
});

app.delete("/api/threads/:threadId", async (req, res) => {
  try {
    const memory = await chatAgent.getMemory();
    if (!memory) {
      res.status(404).json({ error: "Memory not available" });
      return;
    }
    await memory.deleteThread(req.params.threadId);
    res.json({ ok: true });
  } catch (err) {
    logServer("Failed to delete thread.", { error: String(err) });
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

app.get("/api/threads/:threadId", async (req, res) => {
  try {
    const memory = await chatAgent.getMemory();
    if (!memory) {
      res.json({ messages: [] });
      return;
    }

    const { messages } = await memory.recall({
      threadId: req.params.threadId,
      resourceId: "local-user"
    });

    const formatted = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const textPart = m.content.parts.find((p) => (p as { type: string }).type === "text");
        const content = textPart ? (textPart as { type: string; text: string }).text : "";
        return { role: m.role as "user" | "assistant", content };
      });

    res.json({ messages: formatted });
  } catch {
    res.json({ messages: [] });
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
