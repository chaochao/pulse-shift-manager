import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, Sparkles, Send, ChevronDown, ChevronRight, Wrench, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ToolEvent {
  toolName: string
  args?: unknown
  result?: unknown
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  toolEvents?: ToolEvent[]
}

interface Proposal {
  proposalId: string
  label: string
}

interface AskPulseDrawerProps {
  open: boolean
  onClose: () => void
  onReviewProposal?: (proposalId: string, label: string) => void
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  threadId: string
}

const SUGGESTIONS = [
  'Any coverage gaps this week?',
  'Is any staff overloaded?',
  'Any special notes for this period?',
]

function generateThreadId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const TOOL_LABELS: Record<string, string> = {
  getCoverageGaps: 'Checked coverage gaps',
  getShifts: 'Fetched shifts',
  getStaff: 'Fetched staff',
  getPatients: 'Fetched patient census',
  getSchedulingRules: 'Fetched scheduling rules',
  getBlockedDates: 'Checked time off & sick calls',
  scoreSchedule: 'Scored schedule',
  proposeShifts: 'Generated proposal',
  recommendShifts: 'Recommended staff',
}

function ToolEvidenceCard({ event }: { event: ToolEvent }) {
  const [open, setOpen] = useState(false)
  const label = TOOL_LABELS[event.toolName] ?? event.toolName
  return (
    <div className="border border-[#dddddd] rounded-lg overflow-hidden text-[10px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-[#f7f7f7] hover:bg-[#f2f2f2] transition-colors text-left"
      >
        <Wrench size={10} className="text-[#4f86c6] flex-none" />
        <span className="text-[#222222] font-medium flex-1">{label}</span>
        {open ? <ChevronDown size={10} className="text-[#6a6a6a]" /> : <ChevronRight size={10} className="text-[#6a6a6a]" />}
      </button>
      {open && (
        <div className="px-2 py-2 bg-white border-t border-[#dddddd] max-h-32 overflow-y-auto">
          <pre className="text-[#6a6a6a] whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(event.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

interface CoverageGap {
  department: string
  date: string
  shift: string
  scheduled: number
  required: number
  gap: number
}

function CoverageGapTable({ toolEvents }: { toolEvents: ToolEvent[] }) {
  const event = toolEvents.find(e => e.toolName === 'getCoverageGaps')
  if (!event) return null
  const result = event.result as { gaps: CoverageGap[]; summary: { totalGaps: number; daysChecked: number } }
  if (!result?.gaps?.length) return <p className="text-xs text-[#6a6a6a] mt-1">No coverage gaps found.</p>

  const fmt = (iso: string) => {
    // Parse as noon UTC so the date is the same in all timezones
    const d = new Date(`${iso.split('T')[0]}T12:00:00Z`)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="w-full mt-2 rounded-lg border border-[#dddddd] overflow-hidden text-[11px]">
      <div className="px-2.5 py-1.5 bg-[#f7f7f7] border-b border-[#dddddd] flex items-center justify-between">
        <span className="font-semibold text-[#222222]">Coverage Gaps</span>
        <span className="text-[#6a6a6a]">{result.summary.totalGaps} gaps · {result.summary.daysChecked}d</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#fafafa]">
            <tr className="border-b border-[#ebebeb]">
              <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Date</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Dept</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Shift</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Have / Need</th>
            </tr>
          </thead>
          <tbody>
            {result.gaps.map((g, i) => (
              <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                <td className="px-2.5 py-1.5 text-[#222222]">{fmt(g.date)}</td>
                <td className="px-2 py-1.5 text-[#222222]">{g.department}</td>
                <td className="px-2 py-1.5 text-center">
                  {g.shift === 'day'
                    ? <Sun size={11} className="inline text-[#f59e0b]" />
                    : <Moon size={11} className="inline text-[#6366f1]" />}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span className="text-red-600 font-semibold">{g.scheduled}</span>
                  <span className="text-[#6a6a6a]">/{g.required}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface OverloadedStaffRow {
  staffId: string
  name: string
  department: string
  role: string
  hours: number
  hoursLimit: number
  consecutiveDays: number
  maxConsecutive: number
  issues: string[]
}

function OverloadedStaffTable({ result }: { result: unknown }) {
  const data = result as { overloaded: OverloadedStaffRow[]; total: number; periodDays: number; hoursLimit: number }
  if (!data?.overloaded?.length) return <p className="text-xs text-[#6a6a6a] mt-1">No overloaded staff found.</p>

  return (
    <div className="w-full mt-2 rounded-lg border border-[#dddddd] overflow-hidden text-[11px]">
      <div className="px-2.5 py-1.5 bg-[#f7f7f7] border-b border-[#dddddd] flex items-center justify-between">
        <span className="font-semibold text-[#222222]">Overloaded Staff</span>
        <span className="text-[#6a6a6a]">{data.total} flagged · {data.periodDays}d · limit {data.hoursLimit}h</span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#fafafa]">
            <tr className="border-b border-[#ebebeb]">
              <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Staff</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Dept</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Hours</th>
              <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Consec.</th>
              <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">Issues</th>
            </tr>
          </thead>
          <tbody>
            {data.overloaded.map((row, i) => (
              <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                <td className="px-2.5 py-1.5 text-[#222222] font-medium">{row.name}</td>
                <td className="px-2 py-1.5 text-[#6a6a6a]">{row.department}</td>
                <td className="px-2 py-1.5 text-center">
                  <span className={row.hours > row.hoursLimit ? 'text-red-600 font-semibold' : 'text-[#222222]'}>{row.hours}h</span>
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span className={row.consecutiveDays > row.maxConsecutive ? 'text-[#f97316] font-semibold' : 'text-[#222222]'}>{row.consecutiveDays}d</span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {row.issues.map((issue, j) => (
                      <span key={j} className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 text-[10px] font-medium">{issue}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Registry: add an entry here to render a custom UI for a tool result
const TOOL_UI_RENDERERS: Partial<Record<string, React.ComponentType<{ result: unknown }>>> = {
  getCoverageGaps: ({ result }) => <CoverageGapTable toolEvents={[{ toolName: 'getCoverageGaps', result }]} />,
  getOverloadedStaff: ({ result }) => <OverloadedStaffTable result={result} />,
}

// Extract proposals from tool events (reliable) then fall back to text markers
function extractProposals(text: string, toolEvents?: ToolEvent[]): Proposal[] {
  const fromTools = (toolEvents ?? [])
    .filter(e =>
      (e.toolName === 'proposeShifts' || e.toolName === 'recommendShifts') &&
      (e.result as Record<string, unknown>)?.proposalId
    )
    .map((e, i) => {
      const result = e.result as Record<string, unknown>
      if (e.toolName === 'recommendShifts') {
        return {
          proposalId: String(result.proposalId),
          label: `Review Recommendations`,
        }
      }
      return {
        proposalId: String(result.proposalId),
        label: `Review Option ${i + 1} — ${result.optimizeFor === 'coverage' ? 'Better Coverage' : 'Better for Staff'}`,
      }
    })
  if (fromTools.length > 0) return fromTools

  // Fallback: parse text markers
  const proposals: Proposal[] = []
  const regex = /\[Review Option (\d+)\]\s*proposalId:\s*([a-zA-Z0-9_-]+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    proposals.push({ label: `Review Option ${match[1]}`, proposalId: match[2] })
  }
  return proposals
}

// Strip proposal markers from displayed text
function stripProposalMarkers(text: string): string {
  return text.replace(/\[Review Option \d+\]\s*proposalId:\s*[a-zA-Z0-9_-]+/g, '').trim()
}

export function AskPulseDrawer({ open, onClose, onReviewProposal, messages, setMessages, threadId }: AskPulseDrawerProps) {
  const [input, setInput] = useState('')
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(320)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: drawerWidth }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = ev.clientX - dragRef.current.startX
      setDrawerWidth(Math.min(700, Math.max(280, dragRef.current.startWidth + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [drawerWidth])

  useEffect(() => {
    if (open) {
      setMounted(true)
      const t = setTimeout(() => setVisible(true), 16)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    const userMsg = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)

    abortRef.current = new AbortController()
    let assistantContent = ''
    const toolEvents: ToolEvent[] = []
    const pendingToolCalls: Partial<ToolEvent>[] = []
    setMessages(prev => [...prev, { role: 'assistant', content: '', toolEvents: [] }])

    try {
      // Send full history so the model always has conversation context
      const history = messages
        .filter(m => m.content.trim())
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/shift-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, threadId, history }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim())
              if (currentEvent === 'delta' && data.text) {
                assistantContent += data.text
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { role: 'assistant', content: assistantContent, toolEvents: [...toolEvents] },
                ])
              } else if (currentEvent === 'tool-call') {
                pendingToolCalls.push({ toolName: data.toolName, args: data.args })
              } else if (currentEvent === 'tool-result') {
                const pending = pendingToolCalls.shift()
                if (pending) {
                  const event: ToolEvent = { ...pending as ToolEvent, result: data.result }
                  toolEvents.push(event)
                  setMessages(prev => [
                    ...prev.slice(0, -1),
                    { role: 'assistant', content: assistantContent, toolEvents: [...toolEvents] },
                  ])
                }
              } else if (currentEvent === 'error') {
                assistantContent = `Error: ${data.message ?? 'Something went wrong.'}`
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { role: 'assistant', content: assistantContent, toolEvents: [...toolEvents] },
                ])
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: 'Something went wrong. Please try again.' },
        ])
      }
    } finally {
      setStreaming(false)
    }
  }, [streaming])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  if (!mounted) return null

  const showSuggestions = messages.length === 0

  return (
    <div
      className={`fixed left-0 top-0 h-screen bg-white border-r border-[#dddddd] shadow-xl z-40 flex flex-col transition-transform duration-[250ms] ease-out ${visible ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ width: drawerWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#4f86c6]/40 transition-colors z-20"
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#dddddd] flex-none">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#4f86c6]" />
          <span className="font-semibold text-sm text-[#222222]">Ask Pulse</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#6a6a6a] hover:bg-[#f2f2f2] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages / Empty state */}
      <ScrollArea className="flex-1 min-h-0">
        {showSuggestions ? (
          <div className="flex flex-col items-center justify-center px-6 py-8 text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#4f86c6]/10 flex items-center justify-center">
              <Sparkles size={22} className="text-[#4f86c6]" />
            </div>
            <div>
              <p className="font-semibold text-[#222222] text-sm">How can I help?</p>
              <p className="text-[#6a6a6a] text-xs mt-1 leading-relaxed">
                Ask me about coverage gaps, staff workload, or shift recommendations.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#222222] border border-[#dddddd] hover:bg-[#f7f7f7] hover:border-[#4f86c6] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {messages.map((msg, i) => {
              const proposals = msg.role === 'assistant' ? extractProposals(msg.content, msg.toolEvents) : []
              const displayContent = msg.role === 'assistant' ? stripProposalMarkers(msg.content) : msg.content

              return (
                <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length > 0 && (
                    <div className="w-full flex flex-col gap-1 mb-1">
                      {msg.toolEvents.map((e, ti) => (
                        <ToolEvidenceCard key={ti} event={e} />
                      ))}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#4f86c6] text-white whitespace-pre-wrap'
                        : 'bg-[#f7f7f7] text-[#222222]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      displayContent
                    ) : displayContent ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-[#222222]">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          h3: ({ children }) => <h3 className="font-semibold text-[#222222] mb-1 mt-2">{children}</h3>,
                          h2: ({ children }) => <h2 className="font-semibold text-[#222222] mb-1 mt-2">{children}</h2>,
                          code: ({ children }) => <code className="bg-[#e8e8e8] px-1 rounded text-[11px] font-mono">{children}</code>,
                          table: ({ children }) => (
                            <div className="my-2 rounded-lg border border-[#dddddd] overflow-hidden">
                              <table className="w-full border-collapse text-[11px]">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="bg-[#f7f7f7]">{children}</thead>,
                          tbody: ({ children }) => <tbody>{children}</tbody>,
                          tr: ({ children }) => <tr className="border-b border-[#ebebeb] last:border-0">{children}</tr>,
                          th: ({ children }) => <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wide">{children}</th>,
                          td: ({ children }) => <td className="px-2.5 py-1.5 text-[#222222]">{children}</td>,
                        }}
                      >
                        {displayContent}
                      </ReactMarkdown>
                    ) : streaming && i === messages.length - 1 ? (
                      <span className="flex gap-1">
                        <span className="animate-bounce">·</span>
                        <span className="animate-bounce [animation-delay:150ms]">·</span>
                        <span className="animate-bounce [animation-delay:300ms]">·</span>
                      </span>
                    ) : null}
                  </div>
                  {msg.role === 'assistant' && msg.toolEvents?.map((e, i) => {
                    const Renderer = TOOL_UI_RENDERERS[e.toolName]
                    return Renderer ? <Renderer key={i} result={e.result} /> : null
                  })}
                  {proposals.length > 0 && (
                    <div className="flex flex-col gap-1 w-full max-w-[85%]">
                      {proposals.map(p => (
                        <button
                          key={p.proposalId}
                          onClick={() => onReviewProposal?.(p.proposalId, p.label)}
                          className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4f86c6]/10 text-[#4f86c6] border border-[#4f86c6]/30 hover:bg-[#4f86c6]/20 transition-colors text-left"
                        >
                          {p.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-[#dddddd] flex-none">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Pulse..."
            rows={2}
            className="resize-none text-sm flex-1"
            disabled={streaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 flex-none"
            disabled={!input.trim() || streaming}
            onClick={() => sendMessage(input)}
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}
