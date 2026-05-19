import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Patient } from '@/pulse/types'

export function usePatients(departmentId?: string) {
  const params = departmentId ? `?departmentId=${departmentId}` : ''
  return useQuery<Patient[]>({
    queryKey: ['patients', departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/pulse/patients${params}`)
      if (!res.ok) throw new Error('Failed to fetch patients')
      return res.json()
    }
  })
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; departmentId: string; admittedAt: string; expectedDischargeAt: string; notes: string }) => {
      const res = await fetch('/api/pulse/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to create patient')
      return res.json() as Promise<Patient>
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      toast.success(`Patient added — ${data.name}, ${data.department.name}`)
    },
    onError: () => toast.error('Failed to add patient')
  })
}

export function useUpdatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; departmentId: string; admittedAt: string; expectedDischargeAt: string; status: string; notes: string }) => {
      const res = await fetch(`/api/pulse/patients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Failed to update patient')
      return res.json() as Promise<Patient>
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      toast.info(`Patient updated — ${data.name}`)
    },
    onError: () => toast.error('Failed to update patient')
  })
}

export function useDeletePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; name: string }) => {
      const res = await fetch(`/api/pulse/patients/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete patient')
      return res.json()
    },
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      toast.error(`Patient removed — ${name}`)
    },
    onError: () => toast.error('Failed to remove patient')
  })
}
