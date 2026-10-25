import { CalendarIndex } from '../core/calendar'
import { schedule } from '../core/cpm'
import { defaultCalendar } from '../core/holidays'
import { createBaseline } from '../core/tracking'
import { newId, nowIso } from '../core/id'
import { importMspdi } from '../core/mspdi'
import type { Assignment, Link, LinkType, ProjectData, Resource, ResourceType, Task } from '../core/types'
import viDu7a from '../samples/vi-du-7a.xml?raw'

// Dự án mẫu để làm quen chương trình.

export function emptyProject(name: string, start: string, extra: Partial<ProjectData['project']> = {}): ProjectData {
  const now = nowIso()
  const y = Number(start.slice(0, 4))
  return {
    project: {
      id: newId(), code: '', name, status: 'chuan_bi', start, calendar: defaultCalendar([y, y + 1, y + 2]),
      rescheduleAfterStatus: true, createdAt: now, updatedAt: now, ...extra,
    },
    tasks: [], links: [], resources: [], assignments: [], baselines: [],
  }
}

export function sampleViDu7A(): ProjectData {
  const d = importMspdi(viDu7a).data
  d.project.name = 'Ví dụ 7A - Lập tiến độ thi công (bài tập MS Project)'
  d.project.code = 'VD-7A'
  return d
}

export function sampleNhaPho(): ProjectData {
  // khởi công vào thứ Hai cách đây khoảng 3 tuần để có sẵn số liệu theo dõi
  const today = new Date()
  const monday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - 21))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const d = emptyProject('Nhà phố 3 tầng (mẫu)', `${monday.toISOString().slice(0, 10)}T07:30`, {
    code: 'NP-01', owner: 'Ông Nguyễn Văn A', location: 'TP. Thủ Đức, TP.HCM', manager: 'KS. Trần Văn B',
    budget: 2_600_000_000, status: 'thuc_hien',
  })
  const tasks: Task[] = []
  const links: Link[] = []
  const resources: Resource[] = []
  const assignments: Assignment[] = []
  const orderOf = new Map<string | null, number>()
  const byKey = new Map<string, string>()

  const T = (key: string, name: string, duration: number, parent: string | null = null, extra: Partial<Task> = {}) => {
    const id = newId()
    const parentId = parent ? byKey.get(parent)! : null
    const order = orderOf.get(parentId) ?? 0
    orderOf.set(parentId, order + 1)
    byKey.set(key, id)
    tasks.push({ id, parentId, order, name, duration, constraint: 'ASAP', percentComplete: 0, ...extra })
  }
  const L = (a: string, b: string, type: LinkType = 'FS', lag = 0) =>
    links.push({ id: newId(), predecessorId: byKey.get(a)!, successorId: byKey.get(b)!, type, lag })
  const R = (key: string, name: string, type: ResourceType, rate: number, unit?: string, extra: Partial<Resource> = {}) => {
    const id = newId()
    byKey.set('r:' + key, id)
    resources.push({ id, name, type, rate, unit, costPerUse: 0, ...extra })
  }
  const A = (task: string, res: string, units: number) =>
    assignments.push({ id: newId(), taskId: byKey.get(task)!, resourceId: byKey.get('r:' + res)!, units })

  R('cn', 'Công nhân phổ thông', 'work', 350_000, 'công', { group: 'Tổ nề' })
  R('ne', 'Thợ nề', 'work', 450_000, 'công', { group: 'Tổ nề' })
  R('cp', 'Thợ cốp pha', 'work', 450_000, 'công', { group: 'Tổ cốp pha' })
  R('sat', 'Thợ sắt', 'work', 450_000, 'công', { group: 'Tổ sắt' })
  R('dn', 'Thợ điện nước', 'work', 500_000, 'công', { group: 'Tổ điện nước' })
  R('son', 'Thợ sơn', 'work', 420_000, 'công', { group: 'Tổ hoàn thiện' })
  R('epcoc', 'Máy ép cọc', 'work', 3_500_000, 'ca', { isEquipment: true, costPerUse: 5_000_000 })
  R('dao', 'Máy đào 0,4 m3', 'work', 2_800_000, 'ca', { isEquipment: true })
  R('bt', 'Bê tông thương phẩm M250', 'material', 1_350_000, 'm3')
  R('thep', 'Thép xây dựng', 'material', 17_000_000, 'tấn')
  R('cocbt', 'Cọc BTCT 250x250', 'material', 280_000, 'm')
  R('gach', 'Gạch ống 8x8x18', 'material', 1_300, 'viên')
  R('khac', 'Chi phí khác', 'cost', 0)

  T('cb', 'Công tác chuẩn bị', 0)
  T('kc', 'Khởi công', 0, 'cb')
  T('mb', 'Dọn dẹp mặt bằng, lán trại', 3, 'cb')
  T('dv', 'Định vị công trình', 1, 'cb')
  T('mo', 'Phần móng', 0)
  T('coc', 'Ép cọc BTCT', 5, 'mo', { unit: 'm', quantity: 480 })
  T('dd', 'Đào đất hố móng', 3, 'mo', { unit: 'm3', quantity: 120 })
  T('lot', 'Đập đầu cọc, bê tông lót', 2, 'mo')
  T('ctm', 'Cốt thép, cốp pha móng và đà kiềng', 5, 'mo')
  T('btm', 'Đổ bê tông móng, đà kiềng', 1, 'mo', { unit: 'm3', quantity: 32 })
  T('bdm', 'Bảo dưỡng, tháo cốp pha móng', 3, 'mo')
  T('lap', 'Lấp đất, tôn nền', 2, 'mo')
  T('than', 'Phần thân', 0)
  for (const [i, floor] of ['Tầng 1', 'Tầng 2', 'Tầng 3 và mái'].entries()) {
    const k = `t${i + 1}`
    T(k, floor, 0, 'than')
    T(`${k}c`, `Cột ${floor.toLowerCase()}`, 3, k)
    T(`${k}d`, `Cốt thép, cốp pha dầm sàn ${floor.toLowerCase()}`, 6, k)
    T(`${k}b`, `Đổ bê tông dầm sàn ${floor.toLowerCase()}`, 1, k, { unit: 'm3', quantity: 28 })
    T(`${k}x`, `Xây tường ${floor.toLowerCase()}`, 6, k)
    L(`${k}c`, `${k}d`)
    L(`${k}d`, `${k}b`)
    A(`${k}c`, 'cp', 4); A(`${k}c`, 'sat', 3)
    A(`${k}d`, 'cp', 6); A(`${k}d`, 'sat', 4); A(`${k}d`, 'thep', 2.2)
    A(`${k}b`, 'cn', 8); A(`${k}b`, 'bt', 28)
    A(`${k}x`, 'ne', 4); A(`${k}x`, 'cn', 2); A(`${k}x`, 'gach', 14000)
    if (i > 0) L(`t${i}b`, `${k}c`, 'FS', 3) // chờ bê tông sàn dưới đủ cường độ
    L(`${k}b`, `${k}x`, 'FS', 7)
  }
  T('ht', 'Hoàn thiện', 0)
  T('dna', 'Điện nước âm tường', 5, 'ht')
  T('tt', 'Tô trát trong và ngoài', 10, 'ht')
  T('ol', 'Ốp lát gạch nền, vệ sinh', 6, 'ht')
  T('sb', 'Sơn bả', 7, 'ht')
  T('tb', 'Lắp đặt thiết bị điện nước', 3, 'ht')
  T('vs', 'Vệ sinh công trình', 2, 'ht')
  T('nt', 'Nghiệm thu, bàn giao', 0)

  L('kc', 'mb'); L('mb', 'dv'); L('dv', 'coc')
  L('coc', 'dd'); L('dd', 'lot'); L('lot', 'ctm'); L('ctm', 'btm'); L('btm', 'bdm'); L('bdm', 'lap')
  L('lap', 't1c')
  L('t1x', 'dna', 'SS', 2)
  L('t3x', 'tt'); L('dna', 'tt', 'FF', 2)
  L('tt', 'ol', 'SS', 4); L('tt', 'sb'); L('ol', 'tb'); L('sb', 'tb', 'FF')
  L('tb', 'vs'); L('vs', 'nt')

  A('mb', 'cn', 4); A('mb', 'khac', 15_000_000)
  A('dv', 'cn', 2)
  A('coc', 'epcoc', 1); A('coc', 'cn', 3); A('coc', 'cocbt', 480)
  A('dd', 'dao', 1); A('dd', 'cn', 4)
  A('lot', 'cn', 4); A('lot', 'bt', 4)
  A('ctm', 'cp', 4); A('ctm', 'sat', 4); A('ctm', 'thep', 3.5)
  A('btm', 'cn', 8); A('btm', 'bt', 32)
  A('bdm', 'cn', 1)
  A('lap', 'cn', 4)
  A('dna', 'dn', 3)
  A('tt', 'ne', 6); A('tt', 'cn', 3)
  A('ol', 'ne', 4)
  A('sb', 'son', 4)
  A('tb', 'dn', 3)
  A('vs', 'cn', 4)

  const plan: ProjectData = { ...d, tasks, links, resources, assignments }
  // lưu kế hoạch gốc rồi ghi nhận thực tế: ép cọc trễ 2 ngày, đào đất đang làm
  plan.baselines = [createBaseline(plan, 'Kế hoạch được duyệt')]
  const s = schedule(plan.project, plan.tasks, plan.links)
  const cal = new CalendarIndex(plan.project.calendar, plan.project.start)
  const at = (k: string) => plan.tasks.find((t) => t.id === byKey.get(k))!
  const done = (k: string, extraDays = 0) => {
    const t = at(k)
    const st = s.tasks.get(t.id)!
    t.actualStart = st.start
    t.actualFinish = t.duration === 0 ? st.start : cal.addWorkingDays(st.start, t.duration + extraDays)
    t.percentComplete = 100
  }
  done('kc'); done('mb'); done('dv'); done('coc', 2)
  const coc = at('coc')
  const dd = at('dd')
  dd.actualStart = cal.toDate(cal.toMinutes(coc.actualFinish!), 'start')
  dd.percentComplete = 40
  plan.project.statusDate = cal.addWorkingDays(dd.actualStart, 1).slice(0, 10)
  return plan
}
