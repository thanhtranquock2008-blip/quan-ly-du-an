import { CalendarIndex } from './calendar'
import { computeCosts } from './cost'
import { schedule, type ScheduleResult } from './cpm'
import { newId, nowIso } from './id'
import type { Baseline, ProjectData } from './types'

// Theo dõi tiến độ so với kế hoạch gốc (TD-04, TD-05).

export function createBaseline(data: ProjectData, name: string, sched = schedule(data.project, data.tasks, data.links)): Baseline {
  const costs = computeCosts(data.tasks, data.resources, data.assignments, sched)
  return {
    id: newId(),
    name,
    createdAt: nowIso(),
    entries: data.tasks.map((t) => {
      const s = sched.tasks.get(t.id)!
      return { taskId: t.id, start: s.start, finish: s.finish, duration: s.duration, cost: costs.byTask.get(t.id) ?? 0 }
    }),
  }
}

export type TrackStatus = 'hoan_thanh' | 'dang_lam' | 'chua_bat_dau' | 'tre_han' | 'cham' | 'sap_den_han'

export interface TrackRow {
  taskId: string
  baselineStart?: string
  baselineFinish?: string
  start: string
  finish: string
  /** Chênh lệch theo ngày làm việc, dương = trễ hơn kế hoạch gốc */
  startVariance?: number
  finishVariance?: number
  durationVariance?: number
  costVariance?: number
  /** % lẽ ra phải đạt tại ngày cập nhật theo kế hoạch gốc */
  expectedPercent?: number
  percentComplete: number
  status: TrackStatus
}

export const STATUS_LABEL: Record<TrackStatus, string> = {
  hoan_thanh: 'Hoàn thành',
  dang_lam: 'Đang thi công',
  chua_bat_dau: 'Chưa bắt đầu',
  tre_han: 'Trễ hạn',
  cham: 'Chậm so với kế hoạch',
  sap_den_han: 'Sắp đến hạn',
}

export function trackProgress(
  data: ProjectData,
  baseline: Baseline | undefined,
  sched: ScheduleResult = schedule(data.project, data.tasks, data.links),
  /** Số ngày làm việc coi là "sắp đến hạn" */
  dueSoonDays = 3,
): TrackRow[] {
  const cal = new CalendarIndex(data.project.calendar, data.project.start)
  const mpd = cal.mpd
  const costs = computeCosts(data.tasks, data.resources, data.assignments, sched)
  const bl = new Map(baseline?.entries.map((e) => [e.taskId, e]))
  const statusDate = data.project.statusDate ?? new Date().toISOString().slice(0, 10)
  const statusPos = cal.toMinutes(`${statusDate}T23:59`)
  const diff = (a: string, b: string) => Math.round(((cal.toMinutes(a) - cal.toMinutes(b)) / mpd) * 100) / 100

  return sched.tree.ordered.map((t) => {
    const s = sched.tasks.get(t.id)!
    const b = bl.get(t.id)
    let expected: number | undefined
    const refStart = cal.toMinutes(b?.start ?? s.start)
    const refFinish = cal.toMinutes(b?.finish ?? s.finish)
    if (refFinish <= refStart) expected = statusPos >= refFinish ? 100 : 0
    else expected = Math.max(0, Math.min(100, ((statusPos - refStart) / (refFinish - refStart)) * 100))
    expected = Math.round(expected)

    let status: TrackStatus
    const pct = s.percentComplete
    if (s.complete || pct >= 100) status = 'hoan_thanh'
    else if (statusPos >= refFinish) status = 'tre_han'
    else if (pct + 0.5 < expected) status = 'cham'
    else if ((refFinish - statusPos) / mpd <= dueSoonDays && statusPos > refStart) status = 'sap_den_han'
    else if (pct > 0 || t.actualStart) status = 'dang_lam'
    else status = 'chua_bat_dau'

    return {
      taskId: t.id,
      baselineStart: b?.start,
      baselineFinish: b?.finish,
      start: s.start,
      finish: s.finish,
      startVariance: b ? diff(s.start, b.start) : undefined,
      finishVariance: b ? diff(s.finish, b.finish) : undefined,
      durationVariance: b ? Math.round((s.duration - b.duration) * 100) / 100 : undefined,
      costVariance: b ? (costs.byTask.get(t.id) ?? 0) - b.cost : undefined,
      expectedPercent: expected,
      percentComplete: pct,
      status,
    }
  })
}
