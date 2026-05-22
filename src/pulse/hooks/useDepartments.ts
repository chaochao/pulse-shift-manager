import { useQuery } from '@tanstack/react-query'
import type { Department } from '@/pulse/types'

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/pulse/departments')
      if (!res.ok) throw new Error('Failed to fetch departments')
      return res.json()
    },
    staleTime: 30_000
  })
}
