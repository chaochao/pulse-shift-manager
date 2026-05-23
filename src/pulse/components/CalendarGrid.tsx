import { useState } from 'react'
import { useHighlight } from '@/pulse/context/HighlightContext'
import { format, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Pencil, Sun, Moon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getMonthGrid, getWeekDays,
  navigateMonth, navigateWeek,
  formatMonthYear, formatWeekRange,
  formatDateKey, isToday,
  getQueryRange,
  groupByDateAndDept,
  groupByDateTypeDept
} from '@/pulse/lib/calendarUtils'
import { ShiftCard } from './ShiftCard'
import { ShiftDialog } from './ShiftDialog'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { useDeleteShift } from '@/pulse/hooks/useShiftMutations'
import type { Shift, Department, ViewMode } from '@/pulse/types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHIFT_TYPES = ['day', 'night'] as const
const SHIFT_LABELS = { day: 'Day (7am–7pm)', night: 'Night (7pm–7am)' }

export function CalendarGrid() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [listShifts, setListShifts] = useState<Shift[] | null>(null)
  const [bodyVisible, setBodyVisible] = useState(true)

  function fadeSwap(update: () => void) {
    setBodyVisible(false)
    setTimeout(() => { update(); setBodyVisible(true) }, 120)
  }

  const { start, end } = getQueryRange(viewMode, currentDate)
  const { data: shifts = [] } = useShifts(start, end)
  const { data: departments = [] } = useDepartments()

  const { highlightDates } = useHighlight()
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]))
  const byDateDept = groupByDateAndDept(shifts)
  const byDateTypeDept = groupByDateTypeDept(shifts)

  // Compute gap detail per day: total count + per-dept day/night breakdown
  type GapInfo = { total: number; details: { name: string; day: number; night: number }[] }
  const gapsByDate: Record<string, GapInfo> = {}
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = formatDateKey(cursor)
    const details: { name: string; day: number; night: number }[] = []
    for (const dept of departments) {
      const dayGap = Math.max(0, dept.minStaffDay - shifts.filter(s =>
        s.date.slice(0, 10) === key && s.departmentId === dept.id && s.type === 'day' && s.status !== 'absent'
      ).length)
      const nightGap = Math.max(0, dept.minStaffNight - shifts.filter(s =>
        s.date.slice(0, 10) === key && s.departmentId === dept.id && s.type === 'night' && s.status !== 'absent'
      ).length)
      if (dayGap > 0 || nightGap > 0) details.push({ name: dept.name, day: dayGap, night: nightGap })
    }
    if (details.length > 0) gapsByDate[key] = { total: details.reduce((s, d) => s + d.day + d.night, 0), details }
    cursor.setDate(cursor.getDate() + 1)
  }

  function openCreate(date: Date) {
    setSelectedDate(date)
    setEditingShift(null)
    setDialogOpen(true)
  }

  function openCardClick(shifts: Shift[], e: React.MouseEvent) {
    e.stopPropagation()
    if (shifts.length === 1) {
      setEditingShift(shifts[0])
      setSelectedDate(new Date(shifts[0].date))
      setDialogOpen(true)
    } else {
      setListShifts(shifts)
    }
  }

  function openShiftFromList(shift: Shift) {
    setEditingShift(shift)
    setSelectedDate(new Date(shift.date))
    setDialogOpen(true)
    // keep listShifts alive so back button can restore it
  }

  function navigate(dir: 'prev' | 'next') {
    fadeSwap(() => setCurrentDate((d) => viewMode === 'month' ? navigateMonth(d, dir) : navigateWeek(d, dir)))
  }

  function switchViewMode(mode: ViewMode) {
    if (mode === viewMode) return
    fadeSwap(() => setViewMode(mode))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#dddddd] flex-none">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[#222222]">
            {viewMode === 'month' ? formatMonthYear(currentDate) : formatWeekRange(currentDate)}
          </h1>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('prev')}>
              <ChevronLeft size={14} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('next')}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
        <div className="flex rounded-md border border-[#dddddd] overflow-hidden text-xs">
          <button
            onClick={() => switchViewMode('month')}
            className={cn('px-3 py-1.5 font-medium transition-colors',
              viewMode === 'month' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
            )}
          >Month</button>
          <button
            onClick={() => switchViewMode('week')}
            className={cn('px-3 py-1.5 font-medium transition-colors',
              viewMode === 'week' ? 'bg-[#222222] text-white' : 'text-[#6a6a6a] hover:bg-[#f7f7f7]'
            )}
          >Week</button>
        </div>
      </div>

      {/* Day labels */}
      <div className={cn('grid border-b border-[#dddddd] flex-none', viewMode === 'week' ? 'grid-cols-[80px_repeat(7,1fr)]' : 'grid-cols-7')}>
        {viewMode === 'week' && <div className="border-r border-[#ebebeb]" />}
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[#6a6a6a] uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar body */}
      <div
        className="flex-1 overflow-auto transition-opacity duration-[120ms]"
        style={{ opacity: bodyVisible ? 1 : 0 }}
      >
        {viewMode === 'month' ? (
          <MonthBody
            currentDate={currentDate}
            byDateDept={byDateDept}
            deptMap={deptMap}
            gapsByDate={gapsByDate}
            highlightDates={highlightDates}
            onCellClick={openCreate}
            onShiftClick={openCardClick}
          />
        ) : (
          <WeekBody
            currentDate={currentDate}
            byDateTypeDept={byDateTypeDept}
            deptMap={deptMap}
            gapsByDate={gapsByDate}
            highlightDates={highlightDates}
            onCellClick={openCreate}
            onShiftClick={openCardClick}
          />
        )}
      </div>

      <ShiftDialog
        open={dialogOpen}
        date={selectedDate}
        shift={editingShift}
        departments={departments}
        onClose={() => { setDialogOpen(false); setEditingShift(null); setListShifts(null) }}
        onBack={listShifts ? () => setDialogOpen(false) : undefined}
      />

      <ShiftListDialog
        shifts={listShifts}
        onEdit={openShiftFromList}
        onClose={() => setListShifts(null)}
        onDeleted={id => setListShifts(prev => {
          const next = prev ? prev.filter(s => s.id !== id) : null
          return next && next.length > 0 ? next : null
        })}
      />
    </div>
  )
}

type GapInfo = { total: number; details: { name: string; day: number; night: number }[] }

function gapDotColor(info: GapInfo | undefined): string | null {
  if (!info) return null
  if (info.total > 5) return 'bg-red-400'
  return 'bg-amber-400'
}

function MonthBody({
  currentDate, byDateDept, deptMap, gapsByDate, highlightDates, onCellClick, onShiftClick
}: {
  currentDate: Date
  byDateDept: Record<string, Record<string, Shift[]>>
  deptMap: Record<string, Department>
  gapsByDate: Record<string, GapInfo>
  highlightDates: Set<string>
  onCellClick: (d: Date) => void
  onShiftClick: (shifts: Shift[], e: React.MouseEvent) => void
}) {
  const weeks = getMonthGrid(currentDate)

  return (
    <div className="grid grid-cols-7 h-full">
      {weeks.flat().map((day, i) => {
        const key = formatDateKey(day)
        const dayDepts = byDateDept[key] ?? {}
        const inMonth = isSameMonth(day, currentDate)

        return (
          <div
            key={i}
            className={cn(
              'group h-[140px] border-b border-r border-[#ebebeb] transition-[background-color,box-shadow] duration-500 flex flex-col',
              inMonth ? 'bg-white hover:bg-[#fafafa]' : 'bg-[#fafafa]',
              highlightDates.has(key) && 'bg-[#eff6ff] shadow-[inset_0_0_0_2px_#4f86c6,0_4px_20px_rgba(79,134,198,0.3)]',
            )}
          >
            <div className="px-2 pt-2 flex-none flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className={cn(
                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                  isToday(day) ? 'bg-[#ff385c] text-white' :
                  inMonth ? 'text-[#222222]' : 'text-[#c1c1c1]'
                )}>
                  {format(day, 'd')}
                </div>
                {(() => {
                  const info = gapsByDate[key]
                  const c = gapDotColor(info)
                  if (!c || !info) return null
                  return (
                    <div className="relative group/gap">
                      <div className={`w-1.5 h-1.5 rounded-full ${c}`} />
                      <div className="pointer-events-none absolute left-0 top-4 z-30 hidden group-hover/gap:block w-max max-w-[200px] rounded-xl bg-white border border-[#ebebeb] shadow-md px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-[#222222] mb-1.5">{info.total} gap{info.total !== 1 ? 's' : ''}</p>
                        {info.details.map(d => (
                          <div key={d.name} className="flex items-center justify-between gap-4 text-[11px] text-[#6a6a6a]">
                            <span>{d.name}</span>
                            <span className="flex items-center gap-1.5 font-medium text-[#222222]">
                              {d.day > 0 && <span className="flex items-center gap-0.5"><span className="text-[#f59e0b]">☀</span>{d.day}</span>}
                              {d.night > 0 && <span className="flex items-center gap-0.5"><span className="text-[#6366f1]">☽</span>{d.night}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className="relative">
                <button
                  onClick={() => onCellClick(day)}
                  className="peer opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full text-[#6a6a6a] hover:bg-[#ebebeb] hover:text-[#222222]"
                >
                  <Plus size={12} />
                </button>
                <span className="pointer-events-none absolute right-0 top-6 z-20 whitespace-nowrap rounded-md bg-[#222222] px-2 py-1 text-[11px] text-white opacity-0 peer-hover:opacity-100 transition-opacity">
                  Add shift — {format(day, 'MMM d')}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-1 min-h-0 mt-1">
              {Object.entries(dayDepts).map(([deptId, depShifts]) => {
                const dept = deptMap[deptId]
                if (!dept) return null
                return (
                  <ShiftCard
                    key={deptId}
                    department={dept}
                    shifts={depShifts}

                    onCardClick={onShiftClick}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function WeekBody({
  currentDate, byDateTypeDept, deptMap, gapsByDate, highlightDates, onCellClick, onShiftClick
}: {
  currentDate: Date
  byDateTypeDept: Record<string, Record<string, Record<string, Shift[]>>>
  deptMap: Record<string, Department>
  gapsByDate: Record<string, GapInfo>
  highlightDates: Set<string>
  onCellClick: (d: Date) => void
  onShiftClick: (shifts: Shift[], e: React.MouseEvent) => void
}) {
  const days = getWeekDays(currentDate)

  return (
    <div>
      {SHIFT_TYPES.map((type) => (
        <div key={type} className="grid grid-cols-[80px_repeat(7,1fr)]">
          <div className="border-b border-r border-[#ebebeb] flex items-center justify-center">
            <span className="text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-widest">
              {SHIFT_LABELS[type]}
            </span>
          </div>
          {days.map((day, i) => {
            const key = formatDateKey(day)
            const depts = byDateTypeDept[key]?.[type] ?? {}
            return (
              <div
                key={i}
                className={cn(
                  'group min-h-[100px] border-b border-r border-[#ebebeb] px-2 pb-2 pt-7 hover:bg-[#fafafa] transition-[background-color,box-shadow] duration-500 relative',
                  highlightDates.has(key) && 'bg-[#eff6ff] shadow-[inset_0_0_0_2px_#4f86c6,0_4px_20px_rgba(79,134,198,0.3)]',
                )}
              >
                <div className="absolute top-1.5 right-1.5">
                  <div className="relative">
                    <button
                      onClick={() => onCellClick(day)}
                      className="peer opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-full text-[#6a6a6a] hover:bg-[#ebebeb] hover:text-[#222222]"
                    >
                      <Plus size={12} />
                    </button>
                    <span className="pointer-events-none absolute right-0 top-6 z-20 whitespace-nowrap rounded-md bg-[#222222] px-2 py-1 text-[11px] text-white opacity-0 peer-hover:opacity-100 transition-opacity">
                      Add shift — {format(day, 'MMM d')}
                    </span>
                  </div>
                </div>
                {Object.entries(depts).map(([deptId, depShifts]) => {
                  const dept = deptMap[deptId]
                  if (!dept) return null
                  return (
                    <ShiftCard
                      key={deptId}
                      department={dept}
                      shifts={depShifts}
  
                      onCardClick={onShiftClick}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ShiftListDialog({
  shifts, onEdit, onClose, onDeleted
}: {
  shifts: Shift[] | null
  onEdit: (shift: Shift) => void
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const deleteShift = useDeleteShift()

  if (!shifts) return null
  const dept = shifts[0]?.department
  const date = shifts[0] ? format(new Date(shifts[0].date), 'MMM d, yyyy') : ''

  async function handleDelete(shift: Shift) {
    await deleteShift.mutateAsync({
      id: shift.id,
      staffName: shift.staff.name,
      deptName: shift.department.name,
      date: shift.date,
      type: shift.type,
    })
    setConfirmId(null)
    onDeleted(shift.id)
  }

  return (
    <Dialog open={!!shifts} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: dept?.color }} />
            {dept?.name} — {date}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {shifts.map((shift) => (
            <div key={shift.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#ebebeb]">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: dept?.color }} />
                <div>
                  <p className="text-sm text-[#222222]">{shift.staff.name}</p>
                  <p className="text-xs text-[#6a6a6a] flex items-center gap-1">
                    {shift.staff.role} ·
                    {shift.type === 'day'
                      ? <Sun size={11} className="text-[#f59e0b]" />
                      : <Moon size={11} className="text-[#6366f1]" />
                    }
                  </p>
                </div>
              </div>
              {confirmId === shift.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#6a6a6a]">Delete?</span>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(shift)} disabled={deleteShift.isPending}>
                    Yes
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => onEdit(shift)}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-red-500 hover:text-red-600 hover:border-red-200" onClick={() => setConfirmId(shift.id)}>
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
