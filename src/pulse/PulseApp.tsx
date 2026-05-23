import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

function generateThreadId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { AskPulseDrawer } from './components/AskPulseDrawer'
import { ShiftProposalModal } from './components/ShiftProposalModal'
import { HighlightProvider, useHighlight } from './context/HighlightContext'
import type { Message } from './components/AskPulseDrawer'

function PulseAppInner() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [proposal, setProposal] = useState<{ id: string; label: string } | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const threadIdRef = useRef<string>(generateThreadId())
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addHighlight } = useHighlight()

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar onAskPulse={() => { setDrawerOpen(d => !d); navigate('/pulse') }} drawerOpen={drawerOpen} />
      <AskPulseDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onReviewProposal={(id, label) => setProposal({ id, label })}
        messages={chatMessages}
        setMessages={setChatMessages}
        threadId={threadIdRef.current}
      />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <div key={location.pathname} className="animate-in fade-in duration-200 flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
      {proposal && (
        <ShiftProposalModal
          proposalId={proposal.id}
          label={proposal.label}
          onClose={() => setProposal(null)}
          onConfirmed={(dates) => {
            setProposal(null)
            queryClient.invalidateQueries({ queryKey: ['shifts'] })
            addHighlight(dates)
          }}
        />
      )}
    </div>
  )
}

export function PulseApp() {
  return (
    <HighlightProvider>
      <PulseAppInner />
    </HighlightProvider>
  )
}
