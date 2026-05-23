import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useStaff } from '@/pulse/hooks/useStaff'
import { useShifts } from '@/pulse/hooks/useShifts'
import { useCreateShift, useUpdateShift, useDeleteShift } from '@/pulse/hooks/useShiftMutations'
import type { Department, Shift, ShiftType } from '@/pulse/types'

interface ShiftDialogProps {
  open: boolean
  date: Date | null
  shift: Shift | null
  departments: Department[]
  onClose: () => void
  onBack?: () => void
  defaultDepartmentId?: string
}

export function ShiftDialog({ open, date, shift, departments, onClose, onBack, defaultDepartmentId }: ShiftDialogProps) {
  const isEdit = shift !== null

  const [departmentId, setDepartmentId] = useState(shift?.departmentId ?? defaultDepartmentId ?? '')
  const [staffId, setStaffId] = useState(shift?.staffId ?? '')
  const [shiftType, setShiftType] = useState<ShiftType>(shift?.type ?? 'day')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setDepartmentId(shift?.departmentId ?? defaultDepartmentId ?? '')
      setStaffId(shift?.staffId ?? '')
      setShiftType(shift?.type ?? 'day')
      setConfirmDelete(false)
    }
  }, [open])

  const { data: allStaff = [] } = useStaff()
  const createShift = useCreateShift()
  const updateShift = useUpdateShift()
  const deleteShift = useDeleteShift()

  const dayStart = date ? new Date(date.toISOString().slice(0, 10) + 'T00:00:00') : null
  const dayEnd = date ? new Date(date.toISOString().slice(0, 10) + 'T23:59:59') : null
  const { data: dayShifts = [] } = useShifts(dayStart ?? new Date(0), dayEnd ?? new Date(0))
  const alreadyScheduled = new Set(
    dayShifts
      .filter(s => !isEdit || s.id !== shift?.id)
      .map(s => s.staffId)
  )

  const filteredStaff = allStaff.filter((s) => s.departmentId === departmentId)
  const selectedStaff = allStaff.find((s) => s.id === staffId)
  const selectedDept = departments.find((d) => d.id === departmentId)

  const warnings: string[] = []
  if (selectedStaff && alreadyScheduled.has(selectedStaff.id)) {
    warnings.push(`${selectedStaff.name} already has a shift on this day`)
  }
  if (selectedStaff && selectedDept) {
    const staffCerts = selectedStaff.certifications.split(',').filter(Boolean)
    const reqCerts = selectedDept.requiredCertifications.split(',').filter(Boolean)
    const missing = reqCerts.filter((c) => !staffCerts.includes(c))
    if (missing.length > 0) {
      warnings.push(`Missing certifications: ${missing.join(', ')}`)
    }
  }

  const isPending = createShift.isPending || updateShift.isPending || deleteShift.isPending

  async function handleSave() {
    if (!date || !departmentId || !staffId) return
    if (isEdit) {
      await updateShift.mutateAsync({ id: shift.id, staffId, departmentId, type: shiftType, hours: 12, status: shift.status })
    } else {
      await createShift.mutateAsync({ staffId, departmentId, date: date.toISOString(), type: shiftType, hours: 12 })
    }
    onClose()
  }

  async function handleDelete() {
    if (!shift) return
    await deleteShift.mutateAsync({ id: shift.id, staffName: shift.staff.name, deptName: shift.department.name, date: shift.date, type: shift.type })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[#6a6a6a] hover:bg-[#f2f2f2] transition-colors flex-none"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            {isEdit ? 'Edit Shift' : `Add Shift — ${date ? format(date, 'MMM d, yyyy') : ''}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={departmentId}
              onValueChange={(v) => { setDepartmentId(v ?? ''); setStaffId('') }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department">
                  {departments.find(d => d.id === departmentId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Staff</Label>
            <Select value={staffId} onValueChange={(v) => setStaffId(v ?? '')} disabled={!departmentId}>
              <SelectTrigger>
                <SelectValue placeholder={departmentId ? 'Select staff member' : 'Select department first'}>
                  {selectedStaff && `${selectedStaff.name} — ${selectedStaff.role}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent style={{ width: 'auto', minWidth: '100%' }}>
                {filteredStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={alreadyScheduled.has(s.id)}>
                    {s.name} — {s.role}
                    {alreadyScheduled.has(s.id) && <span className="ml-1 text-[#aaaaaa]">(already scheduled)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Shift Type</Label>
            <Select value={shiftType} onValueChange={(v) => setShiftType((v ?? 'day') as ShiftType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day (7am – 7pm)</SelectItem>
                <SelectItem value="night">Night (7pm – 7am)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle size={13} className="flex-none" />
              {w}
            </div>
          ))}
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
                <span className="text-xs text-[#6a6a6a]">Delete this shift?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                  Confirm
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </div>
            )}
          </div>
          {!confirmDelete && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isPending || !departmentId || !staffId}
              >
                {isEdit ? 'Update' : 'Add Shift'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
