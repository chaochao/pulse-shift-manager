import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, differenceInDays } from 'date-fns'
import { Sun, Moon, ChevronUp, ChevronDown, Flame, AlertTriangle } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useStaff } from '@/pulse/hooks/useStaff'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { usePatients } from '@/pulse/hooks/usePatients'

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

  const { data: shifts = [] } = useShifts(new Date(startDate), new Date(`${endDate}T23:59:59`))
  const { data: allStaff = [] } = useStaff()
  const { data: departments = [] } = useDepartments()
  const { data: patients = [] } = usePatients()

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
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#dddddd] flex-none">
        <h1 className="text-lg font-semibold text-[#222222]">Analytics</h1>
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
        </div>
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

          {/* Patients pie */}
          <DeptPieChart title="Patients by Department" data={patientsByDept} />

          {/* Staff pie */}
          <DeptPieChart title="Staff by Department" data={staffByDept} />
        </div>

        {/* Overloaded staff */}
        <OverloadedStaffTable rows={rows} maxHoursForPeriod={maxHoursForPeriod} />

        {/* Staff shift table */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Staff Shift Summary</p>
            <p className="text-xs text-[#aaaaaa]">Max {MAX_HOURS_PER_WEEK}h/week · {maxHoursForPeriod}h limit for this period</p>
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
    </div>
  )
}

type Row = { staff: { id: string; name: string; role: string }; dept: { name: string; color: string } | undefined; total: number; day: number; night: number; hours: number; streak: number }

function OverloadedStaffTable({ rows, maxHoursForPeriod }: { rows: Row[]; maxHoursForPeriod: number }) {
  const flagged = rows.filter(r => r.hours > maxHoursForPeriod || r.streak >= 5)
  if (flagged.length === 0) return null

  return (
    <div className="px-6 py-4 border-b border-[#ebebeb]">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={13} className="text-[#f97316]" />
        <p className="text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Overloaded Staff</p>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 font-semibold">{flagged.length}</span>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#ebebeb]">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Staff</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Role</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Department</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Hours</th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">
              <span className="inline-flex items-center justify-end gap-1 w-full"><Flame size={11} className="text-[#f97316]" />Consec. Days</span>
            </th>
            <th className="text-left py-2 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">Issues</th>
          </tr>
        </thead>
        <tbody>
          {flagged.map(({ staff, dept, hours, streak }) => {
            const overHours = hours > maxHoursForPeriod
            const highStreak = streak >= 5
            return (
              <tr key={staff.id} className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors">
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
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${dept?.color}18`, color: dept?.color }}>
                    {dept?.name ?? '—'}
                  </span>
                </td>
                <td className={`py-2.5 pr-4 text-right font-medium ${overHours ? 'text-red-600' : 'text-[#6a6a6a]'}`}>
                  {hours}h
                  {overHours && <span className="ml-1 text-[10px] text-red-400">(+{hours - maxHoursForPeriod}h)</span>}
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${highStreak ? 'text-[#f97316]' : 'text-[#6a6a6a]'}`}>
                    {highStreak && <Flame size={11} className="text-[#f97316]" />}
                    {streak > 0 ? `${streak}d` : '—'}
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex gap-1.5 flex-wrap">
                    {overHours && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium">Over hour limit</span>
                    )}
                    {highStreak && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316] font-medium">{streak}+ consecutive days</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#ebebeb] bg-white">
      <span className="text-2xl font-semibold" style={{ color }}>{value}</span>
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
