import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreatePatient, useUpdatePatient, useDeletePatient } from '@/pulse/hooks/usePatients'
import type { Department, Patient } from '@/pulse/types'

interface PatientDialogProps {
  open: boolean
  patient: Patient | null
  departments: Department[]
  onClose: () => void
}

export function PatientDialog({ open, patient, departments, onClose }: PatientDialogProps) {
  const isEdit = patient !== null

  const [name, setName] = useState(patient?.name ?? '')
  const [departmentId, setDepartmentId] = useState(patient?.departmentId ?? '')
  const [admittedAt, setAdmittedAt] = useState(patient ? format(parseISO(patient.admittedAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
  const [expectedDischargeAt, setExpectedDischargeAt] = useState(patient ? format(parseISO(patient.expectedDischargeAt), 'yyyy-MM-dd') : '')
  const [status, setStatus] = useState(patient?.status ?? 'admitted')
  const [notes, setNotes] = useState(patient?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setName(patient?.name ?? '')
      setDepartmentId(patient?.departmentId ?? '')
      setAdmittedAt(patient ? format(parseISO(patient.admittedAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
      setExpectedDischargeAt(patient ? format(parseISO(patient.expectedDischargeAt), 'yyyy-MM-dd') : '')
      setStatus(patient?.status ?? 'admitted')
      setNotes(patient?.notes ?? '')
      setConfirmDelete(false)
    }
  }, [open])

  const createPatient = useCreatePatient()
  const updatePatient = useUpdatePatient()
  const deletePatient = useDeletePatient()
  const isPending = createPatient.isPending || updatePatient.isPending || deletePatient.isPending

  async function handleSave() {
    if (!name.trim() || !departmentId || !admittedAt || !expectedDischargeAt) return
    if (isEdit) {
      await updatePatient.mutateAsync({ id: patient.id, name, departmentId, admittedAt, expectedDischargeAt, status, notes })
    } else {
      await createPatient.mutateAsync({ name, departmentId, admittedAt, expectedDischargeAt, notes })
    }
    onClose()
  }

  async function handleDelete() {
    if (!patient) return
    await deletePatient.mutateAsync({ id: patient.id, name: patient.name })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Patient' : 'Add Patient'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Patient name"
              className="w-full h-8 rounded-lg border border-input px-2.5 text-sm focus:outline-none focus:border-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={v => setDepartmentId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select department">
                  {departments.find(d => d.id === departmentId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Admitted</Label>
              <input
                type="date"
                value={admittedAt}
                onChange={e => setAdmittedAt(e.target.value)}
                className="w-full h-8 rounded-lg border border-input px-2.5 text-sm focus:outline-none focus:border-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Discharge</Label>
              <input
                type="date"
                value={expectedDischargeAt}
                onChange={e => setExpectedDischargeAt(e.target.value)}
                className="w-full h-8 rounded-lg border border-input px-2.5 text-sm focus:outline-none focus:border-ring"
              />
            </div>
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v ?? 'admitted')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admitted">Admitted</SelectItem>
                  <SelectItem value="discharged">Discharged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full h-8 rounded-lg border border-input px-2.5 text-sm focus:outline-none focus:border-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {isEdit && !confirmDelete && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={isPending}>
                Delete
              </Button>
            )}
            {isEdit && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6a6a6a]">Remove patient?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>Confirm</Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          {!confirmDelete && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isPending || !name.trim() || !departmentId || !expectedDischargeAt}>
                {isEdit ? 'Update' : 'Add Patient'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
