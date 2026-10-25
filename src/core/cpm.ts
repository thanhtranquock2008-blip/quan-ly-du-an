import { CalendarIndex } from './calendar'
import type { Link, LinkType, Project, Task } from './types'
import { buildTree, type TreeIndex } from './wbs'

// Bộ tính tiến độ theo phương pháp đường găng (CPM) trên sơ đồ mạng AON.
// Đơn vị nội bộ: phút làm việc tính từ thời điểm bắt đầu dự án.
// Công thức theo bài giảng: EF = ES + D, LS = LF - D, TF = LS - ES, FFi = ESj - EFi.

export interface ScheduledTask {
  id: string
  wbs: string
  isSummary: boolean
  isMilestone: boolean
  /** Các giá trị tính theo ngày làm việc kể từ đầu dự án (ES đầu tiên = 0) */
  es: number
  ef: number
  ls: number
  lf: number
  tf: number
  ff: number
  /** Thời lượng thực tế đang lên lịch (ngày) */
  duration: number
  critical: boolean
  complete: boolean
  percentComplete: number
  start: string
  finish: string
  lateStart: string
  lateFinish: string
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>
  /** Số ngày làm việc của toàn dự án */
  projectDuration: number
  projectStart: string
  projectFinish: string
  minutesPerDay: number
  tree: TreeIndex
  /** Cảnh báo không chặn việc tính (vd: liên kết trỏ tới công việc không tồn tại) */
  warnings: string[]
}

export class CycleError extends Error {
  readonly taskIds: string[]
  constructor(taskIds: string[], names: string[]) {
    super(`Liên kết bị vòng kín giữa các công việc: ${names.join(' → ')}`)
    this.taskIds = taskIds
  }
}

interface Edge {
  from: string
  to: string
  type: LinkType
  lag: number // phút
}

const EPS = 0.5 // phút, dung sai so sánh

export function schedule(
  project: Project,
  tasks: Task[],
  links: Link[],
  cal = new CalendarIndex(project.calendar, project.start),
): ScheduleResult {
  const tree = buildTree(tasks)
  const mpd = cal.mpd
  const warnings: string[] = []
  const p0 = cal.toMinutes(project.start)
  const rel = (dt: string) => cal.toMinutes(dt) - p0
  const statusPos = project.statusDate && project.rescheduleAfterStatus !== false ? rel(`${project.statusDate.slice(0, 10)}T23:59`) : undefined

  // 1. Quy liên kết về các công việc lá (liên kết với hạng mục tổng hợp áp cho mọi việc con)
  const leaves = tree.ordered.filter((t) => !tree.isSummary(t.id))
  const leafIds = new Set(leaves.map((t) => t.id))
  const edges: Edge[] = []
  const seenEdge = new Set<string>()
  for (const l of links) {
    if (!tree.byId.has(l.predecessorId) || !tree.byId.has(l.successorId)) {
      warnings.push(`Bỏ qua liên kết ${l.id}: công việc không tồn tại`)
      continue
    }
    for (const a of tree.leavesOf(l.predecessorId))
      for (const b of tree.leavesOf(l.successorId)) {
        if (a === b) continue
        const key = `${a}|${b}|${l.type}`
        if (seenEdge.has(key)) continue
        seenEdge.add(key)
        edges.push({ from: a, to: b, type: l.type, lag: (l.lag || 0) * mpd })
      }
  }
  const preds = new Map<string, Edge[]>()
  const succs = new Map<string, Edge[]>()
  for (const id of leafIds) {
    preds.set(id, [])
    succs.set(id, [])
  }
  for (const e of edges) {
    preds.get(e.to)!.push(e)
    succs.get(e.from)!.push(e)
  }

  // 2. Sắp xếp topo (Kahn), phát hiện vòng kín
  const indeg = new Map<string, number>()
  for (const id of leafIds) indeg.set(id, preds.get(id)!.length)
  const queue = leaves.filter((t) => indeg.get(t.id) === 0).map((t) => t.id)
  const topo: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    topo.push(id)
    for (const e of succs.get(id)!) {
      const d = indeg.get(e.to)! - 1
      indeg.set(e.to, d)
      if (d === 0) queue.push(e.to)
    }
  }
  if (topo.length < leafIds.size) {
    const placed = new Set(topo)
    const cycle = findCycle([...leafIds].filter((id) => !placed.has(id)), succs)
    throw new CycleError(cycle, cycle.map((id) => tree.byId.get(id)!.name))
  }

  // 3. Lượt xuôi: khởi sớm, kết sớm
  const ES = new Map<string, number>()
  const EF = new Map<string, number>()
  const done = new Map<string, boolean>()
  for (const id of topo) {
    const t = tree.byId.get(id)!
    const d = Math.max(0, t.duration) * mpd
    let es = 0
    let efMin = -Infinity
    for (const e of preds.get(id)!) {
      const pes = ES.get(e.from)!
      const pef = EF.get(e.from)!
      switch (e.type) {
        case 'FS': es = Math.max(es, pef + e.lag); break
        case 'SS': es = Math.max(es, pes + e.lag); break
        case 'FF': efMin = Math.max(efMin, pef + e.lag); break
        case 'SF': efMin = Math.max(efMin, pes + e.lag); break
      }
    }
    if (efMin > -Infinity) es = Math.max(es, efMin - d)
    if (t.constraint === 'SNET' && t.constraintDate) es = Math.max(es, rel(t.constraintDate))
    if (t.constraint === 'FNET' && t.constraintDate) es = Math.max(es, rel(t.constraintDate) - d)
    if (t.constraint === 'MSO' && t.constraintDate) es = rel(t.constraintDate)

    const pct = clampPct(t.percentComplete)
    let ef: number
    let isDone = false
    if (t.actualStart) es = rel(t.actualStart)
    if (t.actualFinish) {
      ef = rel(t.actualFinish)
      isDone = true
    } else if (pct >= 100) {
      ef = es + d
      isDone = true
    } else if (pct > 0 || t.actualStart) {
      // đang thi công: phần còn lại dời ra sau ngày cập nhật nếu đã trễ
      const doneWork = (d * pct) / 100
      const remain = d - doneWork
      ef = es + d
      if (statusPos !== undefined && statusPos > es) ef = Math.max(es + doneWork, statusPos) + remain
    } else {
      // chưa khởi công: không thể bắt đầu trước ngày cập nhật
      if (statusPos !== undefined && es < statusPos) es = statusPos
      ef = es + d
    }
    ES.set(id, es)
    EF.set(id, ef)
    done.set(id, isDone)
  }

  const finishPos = Math.max(0, ...topo.map((id) => EF.get(id)!))

  // 4. Lượt ngược: kết muộn, khởi muộn
  const LS = new Map<string, number>()
  const LF = new Map<string, number>()
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i]
    const t = tree.byId.get(id)!
    const span = EF.get(id)! - ES.get(id)!
    let lf = finishPos
    for (const e of succs.get(id)!) {
      const sls = LS.get(e.to)!
      const slf = LF.get(e.to)!
      switch (e.type) {
        case 'FS': lf = Math.min(lf, sls - e.lag); break
        case 'SS': lf = Math.min(lf, sls - e.lag + span); break
        case 'FF': lf = Math.min(lf, slf - e.lag); break
        case 'SF': lf = Math.min(lf, slf - e.lag + span); break
      }
    }
    let ls = lf - span
    if ((t.constraint === 'MSO' && t.constraintDate) || done.get(id)) {
      // công việc cố định ngày hoặc đã xong: không có dự trữ phía sau
      ls = Math.min(ls, ES.get(id)!)
      lf = ls + span
    }
    LS.set(id, ls)
    LF.set(id, lf)
  }

  // 5. Dự trữ và đường găng
  const out = new Map<string, ScheduledTask>()
  for (const id of topo) {
    const t = tree.byId.get(id)!
    const es = ES.get(id)!
    const ef = EF.get(id)!
    let ff = finishPos - ef
    for (const e of succs.get(id)!) {
      const ses = ES.get(e.to)!
      const sef = EF.get(e.to)!
      let slack: number
      switch (e.type) {
        case 'FS': slack = ses - e.lag - ef; break
        case 'SS': slack = ses - e.lag - es; break
        case 'FF': slack = sef - e.lag - ef; break
        case 'SF': slack = sef - e.lag - es; break
      }
      ff = Math.min(ff, slack)
    }
    const tf = LS.get(id)! - es
    const isMilestone = t.duration === 0
    const hasPred = preds.get(id)!.length > 0
    const msMode = hasPred ? 'finish' : 'start'
    const isDone = done.get(id)!
    out.set(id, {
      id,
      wbs: tree.wbs.get(id)!,
      isSummary: false,
      isMilestone,
      es: es / mpd,
      ef: ef / mpd,
      ls: LS.get(id)! / mpd,
      lf: LF.get(id)! / mpd,
      tf: round(tf / mpd),
      ff: round(Math.max(0, Math.min(ff, tf)) / mpd),
      duration: (ef - es) / mpd,
      critical: !isDone && tf <= EPS,
      complete: isDone,
      percentComplete: isDone ? 100 : clampPct(t.percentComplete),
      start: cal.toDate(p0 + es, isMilestone ? msMode : 'start'),
      finish: cal.toDate(p0 + ef, isMilestone ? msMode : 'finish'),
      lateStart: cal.toDate(p0 + LS.get(id)!, isMilestone ? 'finish' : 'start'),
      lateFinish: cal.toDate(p0 + LF.get(id)!, 'finish'),
    })
  }

  // 6. Hạng mục tổng hợp: lấy theo các việc con
  const summaries = [...tree.ordered].reverse().filter((t) => tree.isSummary(t.id))
  for (const s of summaries) {
    const kids = (tree.children.get(s.id) ?? []).map((k) => out.get(k.id)!).filter(Boolean)
    if (!kids.length) continue
    const pick = (f: (k: ScheduledTask) => number, agg: (...v: number[]) => number) => agg(...kids.map(f))
    const es = pick((k) => k.es, Math.min)
    const ef = pick((k) => k.ef, Math.max)
    const ls = pick((k) => k.ls, Math.min)
    const lf = pick((k) => k.lf, Math.max)
    const startKid = kids.reduce((a, b) => (b.es < a.es ? b : a))
    const finishKid = kids.reduce((a, b) => (b.ef > a.ef ? b : a))
    const lsKid = kids.reduce((a, b) => (b.ls < a.ls ? b : a))
    const lfKid = kids.reduce((a, b) => (b.lf > a.lf ? b : a))
    const totalDur = kids.reduce((a, k) => a + k.duration, 0)
    const pct = totalDur > 0
      ? kids.reduce((a, k) => a + k.percentComplete * k.duration, 0) / totalDur
      : kids.reduce((a, k) => a + k.percentComplete, 0) / kids.length
    out.set(s.id, {
      id: s.id,
      wbs: tree.wbs.get(s.id)!,
      isSummary: true,
      isMilestone: false,
      es, ef, ls, lf,
      tf: round(Math.min(...kids.map((k) => k.tf))),
      ff: round(Math.min(...kids.map((k) => k.ff))),
      duration: ef - es,
      critical: kids.some((k) => k.critical),
      complete: kids.every((k) => k.complete),
      percentComplete: Math.round(pct * 10) / 10,
      start: startKid.start,
      finish: finishKid.finish,
      lateStart: lsKid.lateStart,
      lateFinish: lfKid.lateFinish,
    })
  }

  const startPos = Math.min(0, ...topo.map((id) => ES.get(id)!))
  return {
    tasks: out,
    projectDuration: round((finishPos - startPos) / mpd),
    projectStart: cal.toDate(p0 + startPos, 'start'),
    projectFinish: cal.toDate(p0 + finishPos, finishPos === 0 ? 'start' : 'finish'),
    minutesPerDay: mpd,
    tree,
    warnings,
  }
}

function clampPct(p: number | undefined): number {
  return Math.min(100, Math.max(0, p ?? 0))
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000
}

function findCycle(nodes: string[], succs: Map<string, Edge[]>): string[] {
  const inSet = new Set(nodes)
  const state = new Map<string, number>() // 1 = đang xét, 2 = xong
  const stack: string[] = []
  const dfs = (u: string): string[] | null => {
    state.set(u, 1)
    stack.push(u)
    for (const e of succs.get(u) ?? []) {
      if (!inSet.has(e.to)) continue
      if (state.get(e.to) === 1) return [...stack.slice(stack.indexOf(e.to)), e.to]
      if (!state.get(e.to)) {
        const r = dfs(e.to)
        if (r) return r
      }
    }
    stack.pop()
    state.set(u, 2)
    return null
  }
  for (const n of nodes) {
    if (!state.get(n)) {
      const r = dfs(n)
      if (r) return r
    }
  }
  return nodes
}
