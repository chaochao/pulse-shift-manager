import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { AskPulseDrawer } from './components/AskPulseDrawer'
import { ShiftProposalModal } from './components/ShiftProposalModal'

export function PulseApp() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [proposal, setProposal] = useState<{ id: string; label: string } | null>(null)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar onAskPulse={() => setDrawerOpen(d => !d)} drawerOpen={drawerOpen} />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <AskPulseDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onReviewProposal={(id, label) => setProposal({ id, label })}
        />
        <div key={location.pathname} className="animate-in fade-in duration-200 flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
      {proposal && (
        <ShiftProposalModal
          proposalId={proposal.id}
          label={proposal.label}
          onClose={() => setProposal(null)}
          onConfirmed={() => setProposal(null)}
        />
      )}
    </div>
  )
}
