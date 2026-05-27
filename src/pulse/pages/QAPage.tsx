import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const QA: { q: string; a: string }[] = [
  {
    q: 'How do I fill a coverage gap?',
    a: 'Open the "Ask Pulse" drawer and type something like "Fill the ICU coverage gap for this week." Pulse will automatically check certifications, time-off, sick calls, and rest rules, then propose the best available staff. You can review and confirm the proposal from the drawer.',
  },
  {
    q: 'How does Pulse pick which staff to assign?',
    a: 'Pulse scores each eligible candidate out of 100 points: up to 40 pts for how well-rested they are (hours since their last shift), up to 40 pts for how far under their weekly contract hours they are, and up to 20 pts for whether the shift type matches their preferred shift. The highest scorer is assigned first.',
  },
  {
    q: 'What are hard blocks vs. warnings?',
    a: 'Hard blocks prevent assignment entirely: approved time off, active sick calls, or missing required certifications. Warnings are soft flags that are noted but do not block the assignment: too little rest between shifts, or exceeding the monthly night-shift cap.',
  },
  {
    q: 'How do I read the Analytics page?',
    a: 'Analytics shows shift distribution by day/night, hours worked per staff member, department coverage rates, and streak stats for the current period. Use the date range picker at the top to change the window. Hover over any chart segment for a breakdown.',
  },
  {
    q: 'What does the coverage score mean?',
    a: 'The coverage score (0–100) reflects how well each department is meeting its minimum staffing requirements for the selected period. A score of 100 means every required slot is filled. Scores drop proportionally to the number and size of unfilled gaps.',
  },
  {
    q: 'How do I view a staff member\'s schedule?',
    a: 'Go to Staff and click any row to open that person\'s detail page. You\'ll see their shift history in list or calendar view, along with a summary of day shifts, night shifts, and total hours for the selected period.',
  },
  {
    q: 'How do I approve a shift proposal?',
    a: 'After Pulse generates a proposal, a "Review Proposal" button appears in the Ask Pulse drawer. Click it to open the proposal modal, review the assignments and any warnings, then click Confirm to write the shifts to the calendar.',
  },
  {
    q: 'How do I set minimum staffing requirements?',
    a: 'Go to Settings → scroll to the department list → set Min Staff Day and Min Staff Night for each department. These thresholds drive both the coverage gap detection and the coverage score.',
  },
  {
    q: 'Can I ask Pulse questions in plain English?',
    a: 'Yes. Open the Ask Pulse drawer and type naturally — for example: "Who is working the night shift in the ER this Friday?", "Show me coverage gaps for next week", or "Which staff have the most hours this month?" Pulse interprets your intent and queries the data.',
  },
  {
    q: 'What does the timezone setting in Settings affect?',
    a: 'The timezone setting controls how Pulse\'s AI agent interprets dates when calculating coverage gaps and recommending staff. For example, "fill gaps this week" resolves Monday–Sunday boundaries in the configured timezone. It does not affect the calendar display, which shows shift dates as stored.',
  },
]

function QAItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#222222] hover:bg-[#f7f7f7] transition-colors"
      >
        <span>{q}</span>
        <ChevronDown size={16} className={cn('flex-none text-[#6a6a6a] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-[#4a4a4a] leading-relaxed border-t border-[#e5e5e5] bg-[#fafafa]">
          {a}
        </div>
      )}
    </div>
  )
}

const DEV_TODOS: { title: string; description: string; detail: string }[] = [
  {
    title: 'Bulk gap-filling across multiple days and departments',
    description:
      'The recommendShifts tool is scoped to one department at a time, and each proposal covers only that department\'s gaps. A manager who wants to fill gaps across multiple departments or across a multi-day range must trigger a separate request per department, receiving one proposal each time.',
    detail:
      'Desired behaviour: a single "fill all gaps this week" request should cover every department in one pass and return a unified proposal. The proposal modal should then let the manager accept or reject assignments per department per day, rather than approving the entire batch at once.',
  },
  {
    title: 'Agent hallucination after long conversations',
    description:
      'After extended chat sessions, the Ask Pulse agent begins fabricating staff names, shift counts, or coverage numbers that do not match the database. The agent\'s context window fills with prior tool results and it starts synthesising plausible-sounding answers instead of querying fresh data.',
    detail:
      'Possible mitigations: (1) enforce a tool call for every factual claim — never let the model answer from memory; (2) summarise or truncate old tool results in the thread before they crowd out the system prompt; (3) add a "reset thread" button in the drawer so the manager can start a fresh context without reloading the page.',
  },
  {
    title: 'Time-off and sick call submission on Staff detail page',
    description:
      'There is no UI for staff to submit time-off requests or sick calls. Both can only be created directly in the database, making it impossible to demo a real request-and-approval workflow.',
    detail:
      'Add two actions to the Staff detail page: (1) a "Request Time Off" button that opens a form with date range, reason, and status fields — submitted requests land in a pending state until a manager approves them; (2) a "Report Sick Call" button that immediately logs a sick call for today. Both should appear in the existing activity/history section of the detail page and invalidate the calendar query so shifts update in real time.',
  },
  {
    title: 'Add staff workflow in the Staff page',
    description:
      'There is currently no way to create a new staff member from within the app. Managers must add staff directly in the database.',
    detail:
      'Build an "Add Staff" dialog in the Staff page using the same pattern as the "Add Patient" flow in the Patients page: a button in the page header opens a form dialog with fields for name, role, department, contract hours, preferred shift, certifications, and max consecutive shifts.',
  },
  {
    title: 'Smarter gap-filling: borrow from overstaffed shifts',
    description:
      'When no free staff are available to fill a gap, check if a sibling shift in the same department on the same day has more staff than the minimum required. If so, move one person from that overstaffed shift to cover the gap.',
    detail:
      'Example: Department has 2 staff total (Alice, Bob). Min day = 1, min night = 1. Current state: Alice + Bob on day shift, night shift empty. Today\'s logic marks night as unfillable because both are already working that day. Desired logic: detect that day shift has 2 scheduled vs. min of 1 (surplus = 1), pull Bob from day and assign him to night → day: Alice, night: Bob.',
  },
]

function TodoItem({ title, description, detail }: { title: string; description: string; detail: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-[#f7f7f7] transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 w-4 h-4 flex-none rounded border-2 border-[#cccccc]" />
          <span className="text-sm font-medium text-[#222222]">{title}</span>
        </div>
        <ChevronDown size={16} className={cn('flex-none mt-0.5 ml-3 text-[#6a6a6a] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[#e5e5e5] bg-[#fafafa] space-y-2">
          <p className="text-sm text-[#4a4a4a] leading-relaxed">{description}</p>
          <p className="text-xs text-[#6a6a6a] leading-relaxed bg-white border border-[#e5e5e5] rounded px-3 py-2 font-mono whitespace-pre-wrap">{detail}</p>
        </div>
      )}
    </div>
  )
}

export function QAPage() {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto space-y-10">
        <section>
          <h1 className="text-xl font-semibold text-[#222222] mb-1">Q&amp;A</h1>
          <p className="text-sm text-[#6a6a6a] mb-6">Frequently asked questions about using Pulse.</p>
          <div className="space-y-2">
            {QA.map(item => <QAItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#222222] mb-1">Developer Notes</h2>
          <p className="text-sm text-[#6a6a6a] mb-4">Known improvements and open TODOs.</p>
          <div className="space-y-2">
            {DEV_TODOS.map(item => <TodoItem key={item.title} {...item} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
