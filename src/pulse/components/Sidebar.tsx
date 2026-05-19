import { NavLink } from 'react-router-dom'
import { Calendar, BarChart2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onAskPulse: () => void
}

export function Sidebar({ onAskPulse }: SidebarProps) {
  const navItem = (to: string, end: boolean, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive ? 'bg-[#f2f2f2] text-[#222222]' : 'text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222]'
      )}
    >
      {icon}
      {label}
    </NavLink>
  )

  return (
    <aside className="w-60 flex-none flex flex-col border-r border-[#dddddd] bg-white">
      <div className="px-5 py-5 border-b border-[#dddddd]">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="Pulse" className="w-7 h-7 flex-none" />
          <span className="font-semibold text-[#222222]">Pulse</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItem('/pulse', true, <Calendar size={16} />, 'Calendar')}
        {navItem('/pulse/analytics', false, <BarChart2 size={16} />, 'Analytics')}
        <button
          onClick={onAskPulse}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222] transition-colors"
        >
          <Sparkles size={16} />
          Ask Pulse
        </button>
      </nav>
    </aside>
  )
}
