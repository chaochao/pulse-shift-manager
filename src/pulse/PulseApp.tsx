import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { AskPulseDrawer } from './components/AskPulseDrawer'

export function PulseApp() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar onAskPulse={() => setDrawerOpen(true)} />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {drawerOpen && <AskPulseDrawer onClose={() => setDrawerOpen(false)} />}
        <div key={location.pathname} className="animate-in fade-in duration-200 flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
