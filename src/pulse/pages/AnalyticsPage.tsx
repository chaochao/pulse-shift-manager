import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, differenceInDays, eachDayOfInterval } from 'date-fns'
import { Sun, Moon, ChevronUp, ChevronDown, Flame } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useStaff } from '@/pulse/hooks/useStaff'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { usePatients } from '@/pulse/hooks/usePatients'
import { ShiftDialog } from '@/pulse/components/ShiftDialog'
import { ShiftListDialog } from '@/pulse/components/CalendarGrid'

const MAX_HOURS_PER_WEEK = 40

function longestStreak(dates: string[]): number {
  const unique = [...new Set(dates)].sort()
  if (unique.length === 0) return 0
  let max = 1, cur = 1
  for (let i = 1; i < unique.length; i++) {
    const diff = differenceInDays(new Date(unique[i]), new Date(unique[i - 1]))
    if (diff === 1) { cur++; if (cur > max) max = cur }
    else cur = 1
  }
  return max
}

type SortKey = 'name' | 'role' | 'dept' | 'total' | 'day' | 'night' | 'hours' | 'streak'
type SortDir = 'asc' | 'desc'

export function AnalyticsPage() {
  const today = new Date()
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [deptFilter, setDeptFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [shiftDialog, setShiftDialog] = useState<{ date: Date; deptId: string } | null>(null)
  const [editingShift, setEditingShift] = useState<import('@/pulse/types').Shift | null>(null)
  const [addShift, setAddShift] = useState<{ date: Date; deptId: string } | null>(null)

  const { data: shifts = [] } = useShifts(new Date(startDate), new Date(`${endDate}T23:59:59`))
  const { data: allStaff = [] } = useStaff()
  const { data: departments = [] } = useDepartments()
  const { data: patients = [] } = usePatients()

  // Current Mon–Sun week for coverage score
  const weekStart = useMemo(() => {
    const d = new Date()
    const mon = new Date(d)
    mon.setDate(d.getDate() - (d.getDay() + 6) % 7)
    mon.setHours(0, 0, 0, 0)
    return mon
  }, [])
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [weekStart])
  const { data: weekShifts = [] } = useShifts(weekStart, weekEnd)

  const { coverage, filledSlots, totalSlots } = useMemo(() => {
    let total = 0, filled = 0
    const cursor = new Date(weekStart)
    while (cursor <= weekEnd) {
      const key = format(cursor, 'yyyy-MM-dd')
      for (const dept of departments) {
        for (const type of ['day', 'night'] as const) {
          const min = type === 'day' ? dept.minStaffDay : dept.minStaffNight
          if (min === 0) continue
          const count = weekShifts.filter(s =>
            s.departmentId === dept.id &&
            s.date.slice(0, 10) === key &&
            s.type === type &&
            s.status !== 'absent'
          ).length
          total++
          if (count >= min) filled++
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return { coverage: total === 0 ? 100 : Math.round(filled / total * 100), filledSlots: filled, totalSlots: total }
  }, [weekShifts, departments, weekStart, weekEnd])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'role' || key === 'dept' ? 'asc' : 'desc')
    }
  }

  const periodDays = differenceInDays(new Date(endDate), new Date(startDate)) + 1
  const maxHoursForPeriod = Math.round((periodDays / 7) * MAX_HOURS_PER_WEEK)

  const admittedCount = patients.filter(p => p.status === 'admitted').length
  const dischargedCount = patients.filter(p => p.status === 'discharged').length

  const patientsByDept = useMemo(() => {
    const map: Record<string, { name: string; color: string; value: number }> = {}
    for (const p of patients) {
      if (!map[p.departmentId]) {
        map[p.departmentId] = { name: p.department.name, color: p.department.color, value: 0 }
      }
      map[p.departmentId].value++
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [patients])

  const staffByDept = useMemo(() => {
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
    const map: Record<string, { name: string; color: string; value: number }> = {}
    for (const s of allStaff) {
      const dept = deptMap[s.departmentId]
      if (!dept) continue
      if (!map[s.departmentId]) {
        map[s.departmentId] = { name: dept.name, color: dept.color, value: 0 }
      }
      map[s.departmentId].value++
    }
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [allStaff, departments])

  const deptCoverage = useMemo(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
    return departments.map(dept => {
      const gaps: { label: string; dayGap: number; nightGap: number }[] = []
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd')
        const dayCount = weekShifts.filter(s => s.departmentId === dept.id && s.date.slice(0, 10) === key && s.type === 'day' && s.status !== 'absent').length
        const nightCount = weekShifts.filter(s => s.departmentId === dept.id && s.date.slice(0, 10) === key && s.type === 'night' && s.status !== 'absent').length
        const dayGap = dept.minStaffDay > 0 ? Math.max(0, dept.minStaffDay - dayCount) : 0
        const nightGap = dept.minStaffNight > 0 ? Math.max(0, dept.minStaffNight - nightCount) : 0
        if (dayGap > 0 || nightGap > 0) gaps.push({ label: format(day, 'MMM d'), date: day, dayGap, nightGap })
      }
      return { dept, gaps }
    })
  }, [weekShifts, departments, weekStart, weekEnd])

  const rows = useMemo(() => {
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
    const staffToShow = deptFilter
      ? allStaff.filter(s => s.departmentId === deptFilter)
      : allStaff

    const data = staffToShow.map(staff => {
      const staffShifts = shifts.filter(s => s.staffId === staff.id)
      const day = staffShifts.filter(s => s.type === 'day').length
      const night = staffShifts.filter(s => s.type === 'night').length
      const hours = staffShifts.reduce((sum, s) => sum + s.hours, 0)
      const streak = longestStreak(staffShifts.map(s => s.date.substring(0, 10)))
      const dept = deptMap[staff.departmentId]
      return { staff, dept, total: staffShifts.length, day, night, hours, streak }
    })

    return data.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.staff.name.localeCompare(b.staff.name)
      else if (sortKey === 'role') cmp = a.staff.role.localeCompare(b.staff.role)
      else if (sortKey === 'dept') cmp = (a.dept?.name ?? '').localeCompare(b.dept?.name ?? '')
      else if (sortKey === 'total') cmp = a.total - b.total
      else if (sortKey === 'day') cmp = a.day - b.day
      else if (sortKey === 'night') cmp = a.night - b.night
      else if (sortKey === 'hours') cmp = a.hours - b.hours
      else if (sortKey === 'streak') cmp = a.streak - b.streak
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [shifts, allStaff, departments, deptFilter, sortKey, sortDir])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-6 py-3 border-b border-[#dddddd] flex-none">
        <h1 className="text-lg font-semibold text-[#222222]">Analytics</h1>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Dashboard */}
        <div className="px-6 py-5 border-b border-[#ebebeb] flex gap-6">
          {/* Stat cards */}
          <div className="flex flex-col gap-3 justify-center min-w-[160px]">
            <StatCard label="Total Patients" value={patients.length} color="#222222" />
            <StatCard label="Admitted" value={admittedCount} color="#16a34a" />
            <StatCard label="Discharged" value={dischargedCount} color="#6a6a6a" />
            <StatCard label="Total Staff" value={allStaff.length} color="#6366f1" />
          </div>

          {/* Pies + coverage card */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="flex gap-6">
              <DeptPieChart title="Patients by Department" data={patientsByDept} />
              <DeptPieChart title="Staff by Department" data={staffByDept} />
            </div>
            <CoverageCard
              score={coverage}
              filled={filledSlots}
              total={totalSlots}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
          </div>
        </div>

        {/* Department coverage breakdown */}
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide mb-3">
            Staffing Gaps — This Week ({format(weekStart, 'MMM d')}–{format(weekEnd, 'MMM d')})
          </p>
          <div className="grid grid-cols-2 gap-x-8">
            {deptCoverage.map(({ dept, gaps }) => (
              <div key={dept.id} className="flex gap-4 py-2.5 border-b border-[#f5f5f5] items-start">
                <div className="w-24 flex-none pt-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${dept.color}18`, color: dept.color }}>
                    {dept.name}
                  </span>
                </div>
                {gaps.length === 0 ? (
                  <span className="text-xs text-[#16a34a] font-medium">✓ All covered</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {gaps.map(({ label, dayGap, nightGap, date }) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => setShiftDialog({ date, deptId: dept.id })}
                          className="text-[#6a6a6a] w-12 flex-none text-left cursor-pointer hover:text-[#4f86c6] hover:underline transition-colors"
                        >
                          {label}
                        </button>
                        {dayGap > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">
                            <Sun size={10} /> {dayGap} day gap
                          </span>
                        )}
                        {nightGap > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                            <Moon size={10} /> {nightGap} night gap
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Staff shift table */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Staff Shift Summary</p>
            <div className="flex items-center gap-3">
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="h-7 text-xs border border-[#dddddd] rounded-md px-2 text-[#222222] bg-white focus:outline-none focus:border-[#aaaaaa]"
              >
                <option value="">All departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
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
              <p className="text-xs text-[#aaaaaa]">Max {MAX_HOURS_PER_WEEK}h/week · {maxHoursForPeriod}h limit</p>
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ebebeb]">
                {([
                  { key: 'name', label: 'Staff', align: 'left' },
                  { key: 'role', label: 'Role', align: 'left' },
                  { key: 'dept', label: 'Department', align: 'left' },
                  { key: 'total', label: 'Total', align: 'right' },
                  { key: 'day', label: 'Day', align: 'right', icon: <Sun size={12} className="text-[#f59e0b]" /> },
                  { key: 'night', label: 'Night', align: 'right', icon: <Moon size={12} className="text-[#6366f1]" /> },
                  { key: 'hours', label: 'Hours', align: 'right' },
                  { key: 'streak', label: 'Consec. Days', align: 'right', icon: <Flame size={12} className="text-[#f97316]" /> },
                ] as { key: SortKey; label: string; align: string; icon?: React.ReactNode }[]).map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`py-2 ${col.align === 'right' ? 'text-right pr-0 last:pr-0' : 'text-left'} ${col.key !== 'night' ? 'pr-4' : ''} text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide cursor-pointer select-none hover:text-[#222222] transition-colors`}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end w-full' : ''}`}>
                      {col.icon}{col.label}
                      {sortKey === col.key
                        ? sortDir === 'asc'
                          ? <ChevronUp size={12} className="text-[#222222]" />
                          : <ChevronDown size={12} className="text-[#222222]" />
                        : <ChevronDown size={12} className="opacity-0 group-hover:opacity-30" />
                      }
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ staff, dept, total, day, night, hours, streak }) => {
                const overLimit = hours > maxHoursForPeriod
                return (
                <tr key={staff.id} className={`border-b border-[#f5f5f5] transition-colors ${overLimit ? 'bg-red-50 hover:bg-red-50' : 'hover:bg-[#fafafa]'}`}>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: dept?.color ?? '#ccc' }} />
                      <Link to={`/pulse/staff/${staff.id}`} className="text-[#222222] font-medium hover:text-[#4f86c6] hover:underline transition-colors">
                        {staff.name}
                      </Link>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-[#6a6a6a]">{staff.role}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${dept?.color}18`, color: dept?.color }}
                    >
                      {dept?.name ?? '—'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-[#222222]">{total}</td>
                  <td className="py-2.5 pr-4 text-right text-[#f59e0b] font-medium">{day}</td>
                  <td className="py-2.5 pr-4 text-right text-[#6366f1] font-medium">{night}</td>
                  <td className={`py-2.5 pr-4 text-right font-medium ${overLimit ? 'text-red-600' : 'text-[#6a6a6a]'}`}>
                    {hours}h
                    {overLimit && <span className="ml-1 text-[10px] text-red-400">(limit {maxHoursForPeriod}h)</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    {streak > 0 ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${streak >= 5 ? 'text-[#f97316]' : 'text-[#6a6a6a]'}`}>
                        {streak >= 5 && <Flame size={11} className="text-[#f97316]" />}
                        {streak}d
                      </span>
                    ) : (
                      <span className="text-xs text-[#aaaaaa]">—</span>
                    )}
                  </td>
                </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-[#6a6a6a]">
                    No shifts found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ShiftListDialog
        shifts={shiftDialog ? weekShifts.filter(s =>
          s.departmentId === shiftDialog.deptId &&
          s.date.slice(0, 10) === format(shiftDialog.date, 'yyyy-MM-dd')
        ) : null}
        department={shiftDialog ? departments.find(d => d.id === shiftDialog.deptId) : undefined}
        date={shiftDialog?.date}
        onEdit={shift => { setShiftDialog(null); setEditingShift(shift) }}
        onAdd={(deptId, date) => { setShiftDialog(null); setAddShift({ date, deptId }) }}
        onClose={() => setShiftDialog(null)}
        onDeleted={() => {}}
      />
      <ShiftDialog
        open={editingShift !== null}
        date={editingShift ? new Date(editingShift.date) : null}
        shift={editingShift}
        departments={departments}
        defaultDepartmentId={editingShift?.departmentId}
        onClose={() => setEditingShift(null)}
        onBack={() => setEditingShift(null)}
      />
      <ShiftDialog
        open={addShift !== null}
        date={addShift?.date ?? null}
        shift={null}
        departments={departments}
        defaultDepartmentId={addShift?.deptId}
        onClose={() => setAddShift(null)}
      />
    </div>
  )
}

function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    startRef.current = null
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const p = Math.min((ts - startRef.current) / duration, 1)
      const eased = 1 - (1 - p) ** 3
      setDisplay(Math.round(eased * target))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

function CoverageCard({ score, filled, total, weekStart, weekEnd }: {
  score: number; filled: number; total: number; weekStart: Date; weekEnd: Date
}) {
  const animScore = useCountUp(score)
  const animFilled = useCountUp(filled)
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  const bg = score >= 80 ? '#f0fdf4' : score >= 60 ? '#fffbeb' : '#fef2f2'
  const border = score >= 80 ? '#bbf7d0' : score >= 60 ? '#fde68a' : '#fecaca'
  const trackBg = score >= 80 ? '#dcfce7' : score >= 60 ? '#fef3c7' : '#fee2e2'
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
  return (
    <div className="flex items-center gap-6 px-5 py-3.5 rounded-xl border" style={{ backgroundColor: bg, borderColor: border }}>
      <div className="flex-none">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color }}> Week Coverage</p>
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold leading-none" style={{ color }}>{animScore}</span>
          <span className="text-sm font-medium mb-0.5" style={{ color, opacity: 0.5 }}>/100</span>
        </div>
      </div>
      <div className="w-px self-stretch" style={{ backgroundColor: color, opacity: 0.15 }} />
      <div className="flex-none">
        <p className="text-xs font-medium" style={{ color }}>{animFilled} of {total} slots filled</p>
        <p className="text-[11px] mt-0.5" style={{ color, opacity: 0.6 }}>{weekLabel}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-2 rounded-full w-full" style={{ backgroundColor: trackBg }}>
          <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${animScore}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const animated = useCountUp(value)
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#ebebeb] bg-white">
      <span className="text-2xl font-semibold" style={{ color }}>{animated}</span>
      <span className="text-xs text-[#6a6a6a]">{label}</span>
    </div>
  )
}


function DeptPieChart({ title, data }: { title: string; data: { name: string; color: string; value: number }[] }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide mb-2">{title}</p>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={48}
              outerRadius={76}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [value, name]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #ebebeb', boxShadow: 'none' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={value => <span style={{ fontSize: 12, color: '#6a6a6a' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[190px] flex items-center justify-center text-sm text-[#aaaaaa]">No data</div>
      )}
    </div>
  )
}
