import type { ScheduleResult } from './cpm'
import type { Assignment, Resource, Task } from './types'

// Chi phí công việc theo nguồn lực (CP-01, CP-02):
//   nhân công / máy: số lượng × đơn giá ngày × số ngày + phí mỗi lần dùng
//   vật tư:          khối lượng × đơn giá + phí mỗi lần dùng
//   chi phí:         số tiền nhập trực tiếp
// cộng chi phí cố định của công việc, rồi cộng dồn lên hạng mục cha.

export function assignmentCost(a: Assignment, r: Resource, durationDays: number): number {
  switch (r.type) {
    case 'work':
      return a.units * r.rate * durationDays + (r.costPerUse || 0)
    case 'material':
      return a.units * r.rate + (r.costPerUse || 0)
    case 'cost':
      return a.units
  }
}

export interface CostResult {
  /** Chi phí từng công việc (đã cộng dồn với hạng mục tổng hợp) */
  byTask: Map<string, number>
  total: number
}

export function computeCosts(
  tasks: Task[],
  resources: Resource[],
  assignments: Assignment[],
  sched: Pick<ScheduleResult, 'tree'> & { tasks: Map<string, { duration: number }> },
  /** Dùng thời lượng kế hoạch (mặc định) hay thời lượng đang lên lịch */
  useScheduledDuration = false,
): CostResult {
  const res = new Map(resources.map((r) => [r.id, r]))
  const byTask = new Map<string, number>()
  const tree = sched.tree
  for (const t of tasks) {
    if (!tree.isSummary(t.id)) byTask.set(t.id, t.fixedCost || 0)
  }
  for (const a of assignments) {
    const r = res.get(a.resourceId)
    const t = tree.byId.get(a.taskId)
    if (!r || !t || tree.isSummary(t.id)) continue
    const dur = useScheduledDuration ? sched.tasks.get(t.id)?.duration ?? t.duration : t.duration
    byTask.set(t.id, (byTask.get(t.id) ?? 0) + assignmentCost(a, r, dur))
  }
  // cộng dồn từ dưới lên
  for (const t of [...tree.ordered].reverse()) {
    if (!tree.isSummary(t.id)) continue
    const kids = tree.children.get(t.id) ?? []
    byTask.set(t.id, (t.fixedCost || 0) + kids.reduce((s, k) => s + (byTask.get(k.id) ?? 0), 0))
  }
  const total = (tree.children.get(null) ?? []).reduce((s, k) => s + (byTask.get(k.id) ?? 0), 0)
  return { byTask, total }
}

/** Mô tả nguồn lực theo kiểu MS Project: "Công nhân cốt pha [4], Ván khuôn [480 m2]" */
export function resourceLabel(taskId: string, resources: Resource[], assignments: Assignment[]): string {
  const res = new Map(resources.map((r) => [r.id, r]))
  return assignments
    .filter((a) => a.taskId === taskId)
    .map((a) => {
      const r = res.get(a.resourceId)
      if (!r) return ''
      if (r.type === 'cost') return `${r.name} [${formatVnd(a.units)}]`
      if (r.type === 'material') return `${r.name} [${formatNumber(a.units)}${r.unit ? ' ' + r.unit : ''}]`
      return `${r.name} [${formatNumber(a.units)}]`
    })
    .filter(Boolean)
    .join(', ')
}

export function formatNumber(n: number, digits = 2): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: digits })
}

export function formatVnd(n: number): string {
  return Math.round(n).toLocaleString('vi-VN')
}
