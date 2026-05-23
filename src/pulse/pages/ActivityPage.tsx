import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Pencil, Trash2, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityLog {
  id: string
  action: string
  shiftId: string | null
  staffName: string
  departmentName: string
  shiftDate: string
  shiftType: string
  changes: string | null
  source: string
  createdAt: string
}

function useActivity() {
  return useQuery<ActivityLog[]>({
    queryKey: ['activity'],
    queryFn: async () => {
      const r = await fetch('/api/pulse/activity?limit=100')
      if (!r.ok) throw new Error('Failed to load activity')
      return r.json()
    },
  })
}

function ActionIcon({ action }: { action: string }) {
  if (action === 'add') return <Plus size={13} className="text-emerald-600" />
  if (action === 'edit') return <Pencil size={13} className="text-blue-500" />
  return <Trash2 size={13} className="text-red-500" />
}

function actionLabel(action: string) {
  if (action === 'add') return 'Added'
  if (action === 'edit') return 'Edited'
  return 'Deleted'
}

function actionColor(action: string) {
  if (action === 'add') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (action === 'edit') return 'bg-blue-50 border-blue-200 text-blue-700'
  return 'bg-red-50 border-red-200 text-red-700'
}

function parseChanges(raw: string | null): { field: string; from: string; to: string }[] {
  if (!raw) return []
  try {
    const diff = JSON.parse(raw) as Record<string, { from: string; to: string }>
    return Object.entries(diff).map(([field, v]) => ({ field, from: v.from, to: v.to }))
  } catch {
    return []
  }
}

function groupByDay(logs: ActivityLog[]) {
  const groups: { label: string; logs: ActivityLog[] }[] = []
  let currentLabel = ''
  for (const log of logs) {
    const label = format(new Date(log.createdAt), 'EEEE, MMM d, yyyy')
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, logs: [] })
    }
    groups[groups.length - 1].logs.push(log)
  }
  return groups
}

export function ActivityPage() {
  const { data: logs = [], isLoading, error } = useActivity()

  const groups = groupByDay(logs)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-[#222222] mb-1">Activity</h1>
        <p className="text-sm text-[#6a6a6a] mb-6">Recent shift changes — manual and AI-generated.</p>

        {isLoading && (
          <div className="text-sm text-[#6a6a6a]">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-500">Failed to load activity.</div>
        )}
        {!isLoading && logs.length === 0 && (
          <div className="text-sm text-[#6a6a6a]">No activity yet.</div>
        )}

        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <div className="text-xs font-medium text-[#9a9a9a] uppercase tracking-wide mb-3">
                {group.label}
              </div>
              <div className="space-y-2">
                {group.logs.map(log => {
                  const changes = parseChanges(log.changes)
                  return (
                    <div
                      key={log.id}
                      className="flex gap-3 rounded-lg border border-[#e5e5e5] bg-white px-4 py-3"
                    >
                      <div className={cn('mt-0.5 flex-none w-6 h-6 rounded-full border flex items-center justify-center', actionColor(log.action))}>
                        <ActionIcon action={log.action} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#222222]">{log.staffName}</span>
                          <span className="text-xs text-[#6a6a6a]">{log.departmentName}</span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded border font-medium', actionColor(log.action))}>
                            {actionLabel(log.action)}
                          </span>
                          <span className="text-xs text-[#9a9a9a]">
                            {format(new Date(log.shiftDate), 'MMM d')} · {log.shiftType} shift
                          </span>
                        </div>
                        {changes.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {changes.map(c => (
                              <div key={c.field} className="text-xs text-[#6a6a6a]">
                                <span className="capitalize">{c.field}</span>
                                {': '}
                                <span className="line-through text-[#aaaaaa]">{c.from}</span>
                                {' → '}
                                <span className="text-[#222222]">{c.to}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#aaaaaa]">
                          {log.source === 'ai' ? (
                            <><Bot size={11} /> AI proposal</>
                          ) : (
                            <><User size={11} /> Manual</>
                          )}
                          <span>·</span>
                          <span>{format(new Date(log.createdAt), 'h:mm a')}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
