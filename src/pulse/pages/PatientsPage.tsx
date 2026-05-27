import { useState } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Plus, StickyNote, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePatients, useCreatePatient, useUpdatePatient, useDeletePatient } from '@/pulse/hooks/usePatients'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { PatientDialog } from '@/pulse/components/PatientDialog'
import type { Patient } from '@/pulse/types'

type SortKey = 'name' | 'department' | 'admittedAt' | 'expectedDischargeAt' | 'daysLeft' | 'status'
type SortDir = 'asc' | 'desc'

const COLUMNS: { label: string; key: SortKey }[] = [
  { label: 'Patient', key: 'name' },
  { label: 'Department', key: 'department' },
  { label: 'Admitted', key: 'admittedAt' },
  { label: 'Expected Discharge', key: 'expectedDischargeAt' },
  { label: 'Days Left', key: 'daysLeft' },
  { label: 'Status', key: 'status' },
]

function sortPatients(patients: Patient[], key: SortKey, dir: SortDir): Patient[] {
  return [...patients].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'department':
        cmp = a.department.name.localeCompare(b.department.name)
        break
      case 'admittedAt':
        cmp = a.admittedAt.localeCompare(b.admittedAt)
        break
      case 'expectedDischargeAt':
        cmp = a.expectedDischargeAt.localeCompare(b.expectedDischargeAt)
        break
      case 'daysLeft':
        if (a.status === 'discharged' && b.status !== 'discharged') return 1
        if (a.status !== 'discharged' && b.status === 'discharged') return -1
        cmp = differenceInDays(parseISO(a.expectedDischargeAt), new Date())
          - differenceInDays(parseISO(b.expectedDischargeAt), new Date())
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

export function PatientsPage() {
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('admitted')
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('daysLeft')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const { data: patients = [] } = usePatients()
  const { data: departments = [] } = useDepartments()

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = patients.filter(p => {
    if (deptFilter && p.departmentId !== deptFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  })

  const sorted = sortPatients(filtered, sortKey, sortDir)

  function openCreate() {
    setEditingPatient(null)
    setDialogOpen(true)
  }

  function openEdit(patient: Patient) {
    setEditingPatient(patient)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#dddddd] flex-none">
        <h1 className="text-lg font-semibold text-[#222222]">Patients</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-[12px] min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="admitted">Admitted</SelectItem>
              <SelectItem value="discharged">Discharged</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter || '__all__'} onValueChange={v => setDeptFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-7 text-[12px] min-w-[140px]">
              <SelectValue>
                {deptFilter ? (departments.find(d => d.id === deptFilter)?.name ?? 'All departments') : 'All departments'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={openCreate}
            className="h-7 flex items-center gap-1.5 px-3 rounded-lg text-[12px] font-normal border border-[#dddddd] text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222] transition-colors"
          >
            <Plus size={12} /> Add Patient
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#ebebeb]">
              {COLUMNS.map(({ label, key }) => {
                const active = sortKey === key
                return (
                  <th
                    key={key}
                    className="text-left py-2 pr-4 last:pr-0"
                    onClick={() => handleSort(key)}
                  >
                    <button className="flex items-center gap-1 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide hover:text-[#222222] transition-colors">
                      {label}
                      {active
                        ? sortDir === 'asc'
                          ? <ChevronUp size={12} className="text-[#222222]" />
                          : <ChevronDown size={12} className="text-[#222222]" />
                        : <ChevronsUpDown size={12} className="opacity-30" />
                      }
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(patient => {
              const daysLeft = differenceInDays(parseISO(patient.expectedDischargeAt), new Date())
              const isOverdue = daysLeft < 0 && patient.status === 'admitted'
              const isDueSoon = daysLeft >= 0 && daysLeft <= 2 && patient.status === 'admitted'

              return (
                <tr
                  key={patient.id}
                  className="border-b border-[#f5f5f5] hover:bg-[#fafafa] transition-colors cursor-pointer"
                  onClick={() => openEdit(patient)}
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: patient.department.color }} />
                      <span className="text-[#222222] font-medium">{patient.name}</span>
                      {patient.notes && (
                        <div className="relative group/note" onClick={e => e.stopPropagation()}>
                          <StickyNote size={12} className="text-[#aaaaaa] cursor-default flex-none" />
                          <div className="pointer-events-none absolute left-0 top-5 z-20 hidden group-hover/note:block bg-[#f5f5f5] border border-[#e0e0e0] text-[#222222] text-sm rounded-xl px-3.5 py-2.5 w-64 whitespace-pre-wrap shadow-md leading-relaxed">
                            {patient.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${patient.department.color}18`, color: patient.department.color }}
                    >
                      {patient.department.name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-[#6a6a6a]">
                    {format(parseISO(patient.admittedAt), 'MMM d, yyyy')}
                  </td>
                  <td className="py-2.5 pr-4 text-[#6a6a6a]">
                    {format(parseISO(patient.expectedDischargeAt), 'MMM d, yyyy')}
                  </td>
                  <td className="py-2.5 pr-4">
                    {patient.status === 'discharged' ? (
                      <span className="text-[#aaaaaa] text-xs">—</span>
                    ) : isOverdue ? (
                      <span className="text-xs font-medium text-red-600">{Math.abs(daysLeft)}d overdue</span>
                    ) : isDueSoon ? (
                      <span className="text-xs font-medium text-amber-600">{daysLeft}d left</span>
                    ) : (
                      <span className="text-xs font-medium text-[#222222]">{daysLeft}d left</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      patient.status === 'admitted'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-[#f5f5f5] text-[#6a6a6a]'
                    }`}>
                      {patient.status}
                    </span>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-[#6a6a6a]">
                  No patients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PatientDialog
        open={dialogOpen}
        patient={editingPatient}
        departments={departments}
        onClose={() => { setDialogOpen(false); setEditingPatient(null) }}
      />
    </div>
  )
}
