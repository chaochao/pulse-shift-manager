import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, parseISO, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getMonthGrid, formatDateKey, formatMonthYear, navigateMonth, isToday } from '@/pulse/lib/calendarUtils'
import { useStaff } from '@/pulse/hooks/useStaff'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { ShiftDialog } from '@/pulse/components/ShiftDialog'
import type { Shift } from '@/pulse/types'

type View = 'list' | 'calendar'

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const today = new Date()

  const [view, setView] = useState<View>('list')
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [calendarDate, setCalendarDate] = useState(today)
  const [calendarVisible, setCalendarVisible] = useState(true)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const apiStart = view === 'list' ? new Date(startDate) : startOfMonth(calendarDate)
  const apiEnd   = view === 'list' ? new Date(`${endDate}T23:59:59`) : endOfMonth(calendarDate)

  const { data: allStaff = [] } = useStaff()
  const { data: shifts = [] } = useShifts(apiStart, apiEnd)
  const { data: departments = [] } = useDepartments()

  const staff = allStaff.find(s => s.id === id)

  const staffShifts = useMemo(
    () => shifts.filter(s => s.staffId === id).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, id]
  )

  const dayCount = staffShifts.filter(s => s.type === 'day').length
  const nightCount = staffShifts.filter(s => s.type === 'night').length
  const totalHours = staffShifts.reduce((sum, s) => sum + s.hours, 0)

  function fadeNavigate(dir: 'prev' | 'next') {
    setCalendarVisible(false)
    setTimeout(() => { setCalendarDate(d => navigateMonth(d, dir)); setCalendarVisible(true) }, 120)
  }

  function switchView(v: View) {
    if (v === view) return
    setCalendarVisible(false)
    setTimeout(() => { setView(v); setCalendarVisible(true) }, 120)
  }

  if (!staff) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#dddddd] flex-none flex-wrap">
        <button
          onClick={() => navigate('/pulse/staff')}
          className="flex items-center gap-0.5 text-xs text-[#6a6a6a] hover:text-[#222222] transition-colors flex-none"
        >
          <ChevronLeft size={13} /> Staff
        </button>
        <span className="text-[#dddddd] flex-none">/</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: staff.department.color }} />
          <h1 className="text-lg font-semibold text-[#222222] truncate">{staff.name}</h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium flex-none"
            style={{ backgroundColor: `${staff.department.color}18`, color: staff.department.color }}
          >
            {staff.department.name}
          </span>
          <span className="text-xs text-[#6a6a6a] flex-none">{staff.role}</span>
        </div>
        <div className="flex items-center gap-3 flex-none">
          {view === 'list' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="h-7 border border-[#dddddd] rounded-md px-2 text-[#222222] text-xs bg-white focus:outline-none focus:border-[#aaaaaa]"
              />
              <span className="text-xs text-[#6a6a6a]">—</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="h-7 border border-[#dddddd] rounded-md px-2 text-[#222222] text-xs bg-white focus:outline-none focus:border-[#aaaaaa]"
              />
            </div>
          )}
          {/* View toggle */}
          <div className="flex rounded-md border border-[#dddddd] overflow-hidden text-xs">
            <button
              onClick={() => switchView('list')}
              className={cn('px-3 py-1.5 font-medium transition-colors',
                view === 'list' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
              )}
            >List</button>
            <button
              onClick={() => switchView('calendar')}
              className={cn('px-3 py-1.5 font-medium transition-colors',
                view === 'calendar' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
              )}
            >Calendar</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-6 py-4 border-b border-[#ebebeb] flex-none">
        <StatCard label="Total Shifts" value={staffShifts.length} />
        <StatCard label="Day Shifts" value={dayCount} color="#f59e0b" />
        <StatCard label="Night Shifts" value={nightCount} color="#6366f1" />
        <StatCard label="Total Hours" value={`${totalHours}h`} />
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto transition-opacity duration-[120ms]"
        style={{ opacity: calendarVisible ? 1 : 0 }}
      >
        {view === 'list' ? (
          <ListView staffShifts={staffShifts} />
        ) : (
          <CalendarView
            staffShifts={staffShifts}
            calendarDate={calendarDate}
            onNavigate={fadeNavigate}
            onShiftClick={shift => { setEditingShift(shift); setDialogOpen(true) }}
          />
        )}
      </div>

      <ShiftDialog
        open={dialogOpen}
        date={editingShift ? new Date(editingShift.date) : null}
        shift={editingShift}
        departments={departments}
        onClose={() => { setDialogOpen(false); setEditingShift(null) }}
      />
    </div>
  )
}

function ListView({ staffShifts }: { staffShifts: Shift[] }) {
  return (
    <div className="px-6 py-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#ebebeb]">
            {['Date', 'Type', 'Department', 'Hours'].map(h => (
              <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staffShifts.map(shift => (
            <tr key={shift.id} className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors">
              <td className="py-2.5 pr-4 text-[#222222] font-medium">
                {format(parseISO(shift.date), 'EEE, MMM d yyyy')}
              </td>
              <td className="py-2.5 pr-4">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${shift.type === 'day' ? 'text-[#f59e0b]' : 'text-[#6366f1]'}`}>
                  {shift.type === 'day' ? <Sun size={12} /> : <Moon size={12} />}
                  {shift.type === 'day' ? 'Day (7am–7pm)' : 'Night (7pm–7am)'}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${shift.department.color}18`, color: shift.department.color }}
                >
                  {shift.department.name}
                </span>
              </td>
              <td className="py-2.5 text-[#6a6a6a]">{shift.hours}h</td>
            </tr>
          ))}
          {staffShifts.length === 0 && (
            <tr>
              <td colSpan={4} className="py-12 text-center text-sm text-[#6a6a6a]">No shifts for this period.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CalendarView({ staffShifts, calendarDate, onNavigate, onShiftClick }: {
  staffShifts: Shift[]
  calendarDate: Date
  onNavigate: (dir: 'prev' | 'next') => void
  onShiftClick: (shift: Shift) => void
}) {
  const weeks = getMonthGrid(calendarDate)
  const byDate: Record<string, Shift[]> = {}
  for (const s of staffShifts) {
    const key = s.date.substring(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(s)
  }

  return (
    <div className="flex flex-col h-full px-6 py-4">
      {/* Month nav */}
      <div className="flex items-center gap-1 mb-3 flex-none">
        <h2 className="text-sm font-semibold text-[#222222] mr-1">{formatMonthYear(calendarDate)}</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate('prev')}>
          <ChevronLeft size={14} />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => {}}>Today</Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate('next')}>
          <ChevronRight size={14} />
        </Button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-[#dddddd] flex-none">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[#6a6a6a] uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1">
        {weeks.flat().map((day, i) => {
          const key = formatDateKey(day)
          const dayShifts = byDate[key] ?? []
          const inMonth = isSameMonth(day, calendarDate)

          return (
            <div
              key={i}
              className={cn(
                'min-h-[110px] border-b border-r border-[#ebebeb] p-2 flex flex-col',
                inMonth ? 'bg-white' : 'bg-[#fafafa]'
              )}
            >
              <div className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 flex-none',
                isToday(day) ? 'bg-[#ff385c] text-white' :
                inMonth ? 'text-[#222222]' : 'text-[#c1c1c1]'
              )}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-1">
                {dayShifts.map(shift => (
                  <button
                    key={shift.id}
                    onClick={() => onShiftClick(shift)}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-left hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: `${shift.department.color}18`, color: shift.department.color }}
                  >
                    {shift.type === 'day'
                      ? <Sun size={10} className="flex-none text-[#f59e0b]" />
                      : <Moon size={10} className="flex-none text-[#6366f1]" />
                    }
                    <span className="truncate">{shift.type === 'day' ? 'Day' : 'Night'}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#ebebeb] bg-white">
      <span className="text-2xl font-semibold" style={{ color: color ?? '#222222' }}>{value}</span>
      <span className="text-xs text-[#6a6a6a]">{label}</span>
    </div>
  )
}
