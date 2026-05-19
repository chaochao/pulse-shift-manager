import { useState } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePatients, useCreatePatient, useUpdatePatient, useDeletePatient } from '@/pulse/hooks/usePatients'
import { useDepartments } from '@/pulse/hooks/useDepartments'
import { PatientDialog } from '@/pulse/components/PatientDialog'
import type { Patient } from '@/pulse/types'

export function PatientsPage() {
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('admitted')
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: patients = [] } = usePatients()
  const { data: departments = [] } = useDepartments()

  const filtered = patients.filter(p => {
    if (deptFilter && p.departmentId !== deptFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  })

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
              {['Patient', 'Department', 'Admitted', 'Expected Discharge', 'Days Left', 'Status'].map(h => (
                <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-[#6a6a6a] uppercase tracking-wide last:pr-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(patient => {
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
            {filtered.length === 0 && (
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
