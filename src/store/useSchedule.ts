import { useMemo } from 'react'
import { computeCosts, type CostResult } from '../core/cost'
import { schedule, type ScheduleResult } from '../core/cpm'
import type { ProjectData } from '../core/types'
import { useProject } from './projectStore'

export interface Derived {
  data: ProjectData
  sched: ScheduleResult
  costs: CostResult
  /** STT dòng (1, 2, 3...) theo thứ tự hiển thị */
  rowOf: Map<string, number>
}

export function derive(data: ProjectData): Derived {
  const sched = schedule(data.project, data.tasks, data.links)
  const costs = computeCosts(data.tasks, data.resources, data.assignments, sched)
  const rowOf = new Map(sched.tree.ordered.map((t, i) => [t.id, i + 1]))
  return { data, sched, costs, rowOf }
}

/** Dữ liệu dự án đang mở kèm kết quả tính tiến độ và chi phí */
export function useDerived(): Derived | null {
  const data = useProject((s) => s.data)
  return useMemo(() => (data ? derive(data) : null), [data])
}
