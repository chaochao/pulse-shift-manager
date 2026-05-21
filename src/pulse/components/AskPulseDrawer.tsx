import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, Sparkles, Send, ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ToolEvent {
  toolName: string
  args?: unknown
  result?: unknown
}

interface Message {
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
  getShifts: 'Fetched shifts',
  getStaff: 'Fetched staff',
  getPatients: 'Fetched patient census',
  getSchedulingRules: 'Fetched scheduling rules',
  getBlockedDates: 'Checked time off & sick calls',
  scoreSchedule: 'Scored schedule',
  proposeShifts: 'Generated proposal',
  confirmShifts: 'Confirmed shifts',
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

// Extract [Review Option N] proposalId: <id> markers from agent text
function extractProposals(text: string): Proposal[] {
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

export function AskPulseDrawer({ open, onClose, onReviewProposal }: AskPulseDrawerProps) {
  const [input, setInput] = useState('')
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const threadIdRef = useRef<string>(generateThreadId())
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const t = setTimeout(() => setVisible(true), 16)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
      const t = setTimeout(() => {
        setMounted(false)
        setMessages([])
        threadIdRef.current = generateThreadId()
      }, 250)
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
    let pendingToolCall: Partial<ToolEvent> | null = null
    setMessages(prev => [...prev, { role: 'assistant', content: '', toolEvents: [] }])

    try {
      const res = await fetch('/api/shift-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, threadId: threadIdRef.current }),
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
                pendingToolCall = { toolName: data.toolName, args: data.args }
              } else if (currentEvent === 'tool-result' && pendingToolCall) {
                const event: ToolEvent = { ...pendingToolCall as ToolEvent, result: data.result }
                toolEvents.push(event)
                pendingToolCall = null
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
      className={`absolute left-0 top-0 h-full w-80 bg-white border-r border-[#dddddd] shadow-xl z-10 flex flex-col transition-transform duration-[250ms] ease-out ${visible ? 'translate-x-0' : '-translate-x-full'}`}
    >
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
              const proposals = msg.role === 'assistant' ? extractProposals(msg.content) : []
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
