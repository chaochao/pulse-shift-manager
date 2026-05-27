import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  format, isSameMonth, isSameDay
} from 'date-fns'
import type { Shift, ViewMode } from '@/pulse/types'

export function getMonthGrid(date: Date): Date[][] {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

export function getWeekDays(date: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 })
  })
}

export function navigateMonth(date: Date, dir: 'prev' | 'next'): Date {
  return dir === 'next' ? addMonths(date, 1) : subMonths(date, 1)
}

export function navigateWeek(date: Date, dir: 'prev' | 'next'): Date {
  return dir === 'next' ? addWeeks(date, 1) : subWeeks(date, 1)
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy')
}

export function formatWeekRange(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function isCurrentMonth(day: Date, current: Date): boolean {
  return isSameMonth(day, current)
}

export function isToday(day: Date): boolean {
  return isSameDay(day, new Date())
}

export function getQueryRange(viewMode: ViewMode, date: Date): { start: Date; end: Date } {
  if (viewMode === 'month') {
    return {
      start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 })
    }
  }
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start, end }
}

function dateKey(dateStr: string): string {
  // Use the date portion of the ISO string directly to avoid timezone offsets
  return dateStr.slice(0, 10)
}

export function groupByDateAndDept(shifts: Shift[]): Record<string, Record<string, Shift[]>> {
  return shifts.reduce((acc, shift) => {
    const key = dateKey(shift.date)
    if (!acc[key]) acc[key] = {}
    if (!acc[key][shift.departmentId]) acc[key][shift.departmentId] = []
    acc[key][shift.departmentId].push(shift)
    return acc
  }, {} as Record<string, Record<string, Shift[]>>)
}

export function groupByDateTypeDept(shifts: Shift[]): Record<string, Record<string, Record<string, Shift[]>>> {
  return shifts.reduce((acc, shift) => {
    const key = dateKey(shift.date)
    const type = shift.type
    if (!acc[key]) acc[key] = {}
    if (!acc[key][type]) acc[key][type] = {}
    if (!acc[key][type][shift.departmentId]) acc[key][type][shift.departmentId] = []
    acc[key][type][shift.departmentId].push(shift)
    return acc
  }, {} as Record<string, Record<string, Record<string, Shift[]>>>)
}

export function formatRoleSummary(shifts: Shift[]): string {
  const counts = shifts.reduce((acc, s) => {
    acc[s.staff.role] = (acc[s.staff.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  return Object.entries(counts)
    .map(([role, count]) => `${count} ${role}`)
    .join(', ')
}
