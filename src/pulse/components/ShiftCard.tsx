import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatRoleSummary } from '@/pulse/lib/calendarUtils'
import type { Department, Shift } from '@/pulse/types'

interface ShiftCardProps {
  department: Department
  shifts: Shift[]
  onCardClick: (shift: Shift, e: React.MouseEvent) => void
}

export function ShiftCard({ department, shifts, onCardClick }: ShiftCardProps) {
  const summary = formatRoleSummary(shifts)
  const bg = `${department.color}18`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className="rounded-md px-2 py-1 text-xs cursor-pointer mb-1 border-l-[3px] select-none"
          style={{ backgroundColor: bg, borderColor: department.color }}
          onClick={(e) => { e.stopPropagation(); onCardClick(shifts[0], e) }}
        >
          <div className="font-semibold text-[#222222] truncate leading-tight">{department.name}</div>
          <div className="text-[#6a6a6a] truncate leading-tight mt-0.5">{summary}</div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" side="right" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-[#222222] mb-2">{department.name}</p>
        <div className="space-y-0.5">
          {shifts.map((shift) => (
            <div key={shift.id} className="text-xs text-[#6a6a6a]">
              {shift.staff.name}
              <span className="text-[#929292] ml-1">— {shift.staff.role}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
