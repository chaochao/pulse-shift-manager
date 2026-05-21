import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sun, Moon } from 'lucide-react'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { toast } from 'sonner'

interface DeptDraft {
  minStaffDay: number
  minStaffNight: number
  maxStaffDay: number
  maxStaffNight: number
}

interface SchedulingRules {
  id: string
  dayShiftStartHour: number
  nightShiftStartHour: number
  timezone: string
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function hourLabel(h: number) {
  const ampm = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${ampm}`
}

export function SettingsPage() {
  const { data: departments = [] } = useDepartments()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, DeptDraft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const { data: rules } = useQuery<SchedulingRules>({
    queryKey: ['hospital-settings'],
    queryFn: () => fetch('/api/pulse/hospital-settings').then(r => r.json()),
  })

  const [rulesDraft, setRulesDraft] = useState<Partial<SchedulingRules>>({})
  const [savingRules, setSavingRules] = useState(false)

  const effectiveRules = { ...rules, ...rulesDraft } as SchedulingRules
  const rulesIsDirty = Object.keys(rulesDraft).length > 0

  async function saveRules() {
    setSavingRules(true)
    try {
      const res = await fetch('/api/pulse/hospital-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rulesDraft),
      })
      if (!res.ok) throw new Error('Failed to save')
      await queryClient.invalidateQueries({ queryKey: ['hospital-settings'] })
      setRulesDraft({})
      toast.success(`Shift times updated`)
    } catch {
      toast.error('Failed to save shift times')
    } finally {
      setSavingRules(false)
    }
  }

  function getDraft(id: string, field: keyof DeptDraft, fallback: number) {
    return drafts[id]?.[field] ?? fallback
  }

  function setField(id: string, field: keyof DeptDraft, value: number, defaults: DeptDraft) {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? defaults), [field]: value },
    }))
  }

  async function save(id: string, name: string, defaults: DeptDraft) {
    const body = drafts[id] ?? defaults
    setSaving(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/pulse/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save')
      await queryClient.invalidateQueries({ queryKey: ['departments'] })
      setDrafts(prev => { const next = { ...prev }; delete next[id]; return next })
      toast.success(`${name}: Day needs ${body.minStaffDay}–${body.maxStaffDay} staff, Night needs ${body.minStaffNight}–${body.maxStaffNight} staff`)
    } catch {
      toast.error(`Failed to save ${name}`)
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-[#dddddd] flex-none">
        <h1 className="text-lg font-semibold text-[#222222]">Settings</h1>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 space-y-10">
        <div className="max-w-2xl">

          {/* Shift times */}
          <h2 className="text-sm font-semibold text-[#222222] mb-1">Shift Hours</h2>
          <p className="text-sm text-[#6a6a6a] mb-4">
            Configure when day and night shifts start, and the hospital's timezone for scheduling and notifications.
          </p>
          <div className="flex items-end gap-6 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6a6a6a] flex items-center gap-1">
                <Sun size={12} className="text-[#f59e0b]" /> Day shift start
              </label>
              <select
                value={effectiveRules.dayShiftStartHour ?? 8}
                onChange={e => setRulesDraft(prev => ({ ...prev, dayShiftStartHour: Number(e.target.value) }))}
                className="border border-[#dddddd] rounded-md px-2 py-1 text-sm focus:outline-none focus:border-[#4f86c6] focus:ring-1 focus:ring-[#4f86c6]"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{hourLabel(i)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6a6a6a] flex items-center gap-1">
                <Moon size={12} className="text-[#6366f1]" /> Night shift start
              </label>
              <select
                value={effectiveRules.nightShiftStartHour ?? 20}
                onChange={e => setRulesDraft(prev => ({ ...prev, nightShiftStartHour: Number(e.target.value) }))}
                className="border border-[#dddddd] rounded-md px-2 py-1 text-sm focus:outline-none focus:border-[#4f86c6] focus:ring-1 focus:ring-[#4f86c6]"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{hourLabel(i)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6a6a6a]">Timezone</label>
              <select
                value={effectiveRules.timezone ?? 'America/Los_Angeles'}
                onChange={e => setRulesDraft(prev => ({ ...prev, timezone: e.target.value }))}
                className="border border-[#dddddd] rounded-md px-2 py-1 text-sm focus:outline-none focus:border-[#4f86c6] focus:ring-1 focus:ring-[#4f86c6]"
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <button
              onClick={saveRules}
              disabled={!rulesIsDirty || savingRules}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#4f86c6] text-white hover:bg-[#3d6fa8]"
            >
              {savingRules ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Department headcount */}
          <h2 className="text-sm font-semibold text-[#222222] mt-8 mb-1">Department Headcount</h2>
          <p className="text-sm text-[#6a6a6a] mb-4">
            Set minimum and maximum staff headcount per shift type for each department.
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ebebeb]">
                <th className="text-left py-2 pr-6 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide w-36">Department</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1"><Sun size={12} className="text-[#f59e0b]" />Min</span>
                </th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1"><Sun size={12} className="text-[#f59e0b]" />Max</span>
                </th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1"><Moon size={12} className="text-[#6366f1]" />Min</span>
                </th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1"><Moon size={12} className="text-[#6366f1]" />Max</span>
                </th>
                <th className="py-2 pl-4" />
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => {
                const defaults: DeptDraft = {
                  minStaffDay: dept.minStaffDay,
                  minStaffNight: dept.minStaffNight,
                  maxStaffDay: dept.maxStaffDay,
                  maxStaffNight: dept.maxStaffNight,
                }
                const isDirty = !!drafts[dept.id]

                return (
                  <tr key={dept.id} className="border-b border-[#f5f5f5]">
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: dept.color }} />
                        <span className="text-[#222222] font-medium">{dept.name}</span>
                      </div>
                    </td>
                    {(['minStaffDay', 'maxStaffDay', 'minStaffNight', 'maxStaffNight'] as const).map(field => (
                      <td key={field} className="py-3 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={getDraft(dept.id, field, defaults[field])}
                          onChange={e => setField(dept.id, field, Number(e.target.value), defaults)}
                          className="w-14 text-center border border-[#dddddd] rounded-md px-2 py-1 text-sm focus:outline-none focus:border-[#4f86c6] focus:ring-1 focus:ring-[#4f86c6]"
                        />
                      </td>
                    ))}
                    <td className="py-3 pl-4">
                      <button
                        onClick={() => save(dept.id, dept.name, defaults)}
                        disabled={!isDirty || saving[dept.id]}
                        className="px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#4f86c6] text-white hover:bg-[#3d6fa8]"
                      >
                        {saving[dept.id] ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
