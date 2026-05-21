import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Assignment {
  staffId: string
  departmentId: string
  date: string
  type: 'day' | 'night'
  hours: number
}

interface StaffScoreDetail {
  staffId: string
  name: string
  score: number
  flags: string[]
}

interface ScoreResult {
  overall: number
  coverage: number
  individual: { average: number; byStaff: StaffScoreDetail[] }
  equity: number
  warnings: Array<{ rule: string; staffId: string; detail: string }>
}

interface Proposal {
  id: string
  optimizeFor: string
  assignments: Assignment[]
  scores: ScoreResult
  warnings: Array<{ rule: string; staffId: string; detail: string }>
  status: string
}

interface StaffMap {
  [id: string]: { name: string; role: string }
}

interface DeptMap {
  [id: string]: { name: string }
}

interface ShiftProposalModalProps {
  proposalId: string
  label: string
  onClose: () => void
  onConfirmed: () => void
}

function ScoreBadge({ label, value, delta }: { label: string; value: number; delta?: number }) {
  const color = value >= 85 ? 'text-green-600' : value >= 70 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-[#6a6a6a] font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      {delta !== undefined && (
        <span className={`text-[10px] flex items-center gap-0.5 ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {delta >= 0 ? '+' : ''}{delta}
        </span>
      )}
    </div>
  )
}

export function ShiftProposalModal({ proposalId, label, onClose, onConfirmed }: ShiftProposalModalProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [staffMap, setStaffMap] = useState<StaffMap>({})
  const [deptMap, setDeptMap] = useState<DeptMap>({})
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [propRes, staffRes, deptRes] = await Promise.all([
          fetch(`/api/shift-agent/proposal/${proposalId}`),
          fetch('/api/pulse/staff'),
          fetch('/api/pulse/departments'),
        ])
        const [propData, staffData, deptData] = await Promise.all([
          propRes.json(),
          staffRes.json(),
          deptRes.json(),
        ])
        if (!propRes.ok) throw new Error(propData.error ?? 'Failed to load proposal')
        setProposal(propData)
        const sm: StaffMap = {}
        for (const s of staffData) sm[s.id] = { name: s.name, role: s.role }
        setStaffMap(sm)
        const dm: DeptMap = {}
        for (const d of deptData) dm[d.id] = { name: d.name }
        setDeptMap(dm)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load proposal')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [proposalId])

  async function handleConfirm() {
    setConfirming(true)
    try {
      const res = await fetch('/api/shift-agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Confirmation failed')
      onConfirmed()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirmation failed')
      setConfirming(false)
    }
  }

  async function handleReject() {
    await fetch('/api/shift-agent/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId }),
    })
    onClose()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dddddd]">
          <div>
            <p className="font-semibold text-[#222222] text-sm">{label}</p>
            <p className="text-xs text-[#6a6a6a] mt-0.5">
              {proposal?.optimizeFor === 'coverage' ? 'Optimised for hospital coverage' : 'Optimised for staff wellbeing'}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#6a6a6a] hover:bg-[#f2f2f2]">
            <X size={14} />
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[#6a6a6a] text-sm">Loading proposal...</div>
          )}

          {error && (
            <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
          )}

          {proposal && !loading && (
            <div className="p-5 flex flex-col gap-5">
              {/* Scores */}
              <div>
                <p className="text-xs font-semibold text-[#222222] mb-3 uppercase tracking-wide">Schedule Scores</p>
                <div className="grid grid-cols-4 gap-2 p-3 bg-[#f7f7f7] rounded-xl">
                  <ScoreBadge label="Overall" value={proposal.scores.overall} />
                  <ScoreBadge label="Coverage" value={proposal.scores.coverage} />
                  <ScoreBadge label="Individual" value={proposal.scores.individual.average} />
                  <ScoreBadge label="Equity" value={proposal.scores.equity} />
                </div>
              </div>

              {/* Warnings */}
              {proposal.warnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#222222] mb-2 uppercase tracking-wide">Warnings</p>
                  <div className="flex flex-col gap-1.5">
                    {proposal.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-none" />
                        <span className="text-xs text-amber-800">{w.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Proposed assignments */}
              <div>
                <p className="text-xs font-semibold text-[#222222] mb-2 uppercase tracking-wide">
                  Proposed Assignments ({proposal.assignments.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {proposal.assignments.map((a, i) => {
                    const staff = staffMap[a.staffId]
                    const dept = deptMap[a.departmentId]
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-none" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-[#222222]">{staff?.name ?? a.staffId}</span>
                          <span className="text-xs text-[#6a6a6a] ml-1">({staff?.role})</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[#6a6a6a] flex-none">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${a.type === 'night' ? 'bg-[#222222] text-white' : 'bg-[#f7f7f7] text-[#222222]'}`}>
                            {a.type}
                          </span>
                          <span>{dept?.name}</span>
                          <span>{formatDate(a.date)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Per-staff scores */}
              {proposal.scores.individual.byStaff.filter(s =>
                proposal.assignments.some(a => a.staffId === s.staffId)
              ).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#222222] mb-2 uppercase tracking-wide">Staff Impact</p>
                  <div className="flex flex-col gap-1.5">
                    {proposal.scores.individual.byStaff
                      .filter(s => proposal.assignments.some(a => a.staffId === s.staffId))
                      .map(s => (
                        <div key={s.staffId} className="flex items-center gap-3 p-2.5 bg-[#f7f7f7] rounded-lg">
                          <span className="text-xs font-medium text-[#222222] flex-1">{s.name}</span>
                          <span className={`text-xs font-bold ${s.score >= 85 ? 'text-green-600' : s.score >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                            {s.score}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {proposal && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#dddddd]">
            <Button variant="outline" size="sm" onClick={handleReject} disabled={confirming}>
              <XCircle size={13} className="mr-1.5" />
              Reject
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={confirming} className="bg-[#4f86c6] hover:bg-[#3d6fa8]">
              <CheckCircle size={13} className="mr-1.5" />
              {confirming ? 'Confirming…' : 'Confirm Shifts'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
