import { minutesPerDay } from './calendar'
import { schedule } from './cpm'
import { defaultCalendar } from './holidays'
import { newId, nowIso } from './id'
import type {
  Assignment, Baseline, ConstraintType, Holiday, Link, LinkType, Project, ProjectData, Resource,
  ResourceType, Task, WorkCalendar, WorkInterval,
} from './types'

// Nhập / xuất tệp MS Project XML (định dạng MSPDI, "Save As > XML" trong MS Project
// hoặc ProjectLibre). Tiền tệ trong MSPDI lưu theo đơn vị 1/100, thời gian chờ theo 1/10 phút.

export interface ImportResult {
  data: ProjectData
  warnings: string[]
}

const LINK_TYPES: Record<string, LinkType> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' }
const LINK_CODES: Record<LinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }
const RES_TYPES: Record<string, ResourceType> = { '0': 'material', '1': 'work', '2': 'cost' }
const RES_CODES: Record<ResourceType, number> = { material: 0, work: 1, cost: 2 }

/** "PT80H0M0S" hoặc "P1DT2H" → số phút */
export function parseIsoDuration(s: string | null | undefined): number {
  if (!s) return 0
  const m = /^-?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim())
  if (!m) return 0
  const [, d, h, mi, se] = m
  const v = (Number(d) || 0) * 1440 + (Number(h) || 0) * 60 + (Number(mi) || 0) + (Number(se) || 0) / 60
  return s.trim().startsWith('-') ? -v : v
}

export function toIsoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes - h * 60)
  return `PT${h}H${m}M0S`
}

function txt(el: Element | null | undefined, tag: string): string | undefined {
  if (!el) return undefined
  for (const c of Array.from(el.children)) if (c.localName === tag) return c.textContent ?? undefined
  return undefined
}

function kids(el: Element | null | undefined, tag: string): Element[] {
  if (!el) return []
  return Array.from(el.children).filter((c) => c.localName === tag)
}

function child(el: Element | null | undefined, tag: string): Element | undefined {
  return kids(el, tag)[0]
}

const dt = (s?: string) => (s ? s.slice(0, 16) : undefined)
const num = (s?: string, d = 0) => (s === undefined || s === '' || isNaN(Number(s)) ? d : Number(s))

function parseCalendar(cal: Element | undefined, warnings: string[]): WorkCalendar {
  const base = defaultCalendar()
  if (!cal) return base
  const weekdays: number[] = []
  let intervals: WorkInterval[] | undefined
  const holidays: Holiday[] = []
  const extra: string[] = []
  const expandDays = (from: string, to: string, fn: (d: string) => void) => {
    const a = new Date(from.slice(0, 10) + 'T00:00:00Z')
    const b = new Date(to.slice(0, 10) + 'T00:00:00Z')
    for (let d = a; d <= b; d.setUTCDate(d.getUTCDate() + 1)) fn(d.toISOString().slice(0, 10))
  }
  for (const wd of kids(child(cal, 'WeekDays'), 'WeekDay')) {
    const type = num(txt(wd, 'DayType'))
    const working = txt(wd, 'DayWorking') === '1'
    if (type >= 1 && type <= 7) {
      if (working) {
        weekdays.push(type - 1)
        const times = kids(child(wd, 'WorkingTimes'), 'WorkingTime')
          .map((w) => ({ from: (txt(w, 'FromTime') ?? '').slice(0, 5), to: (txt(w, 'ToTime') ?? '').slice(0, 5) }))
          .filter((w) => w.from && w.to)
          .map((w) => (w.to === '00:00' ? { ...w, to: '24:00' } : w))
        if (times.length && !intervals) intervals = times
      }
    } else if (type === 0) {
      // ngoại lệ kiểu cũ (MS Project 2003)
      const tp = child(wd, 'TimePeriod')
      const from = txt(tp, 'FromDate')
      const to = txt(tp, 'ToDate')
      if (from && to) expandDays(from, to, (d) => (working ? extra.push(d) : holidays.push({ date: d, name: 'Ngày nghỉ' })))
    }
  }
  for (const ex of kids(child(cal, 'Exceptions'), 'Exception')) {
    const tp = child(ex, 'TimePeriod')
    const from = txt(tp, 'FromDate')
    const to = txt(tp, 'ToDate')
    const name = txt(ex, 'Name') || 'Ngày nghỉ'
    const working = txt(ex, 'DayWorking') === '1'
    if (from && to) expandDays(from, to, (d) => (working ? extra.push(d) : holidays.push({ date: d, name })))
    if (num(txt(ex, 'Type'), 1) !== 1) warnings.push(`Ngoại lệ lịch "${name}" có lặp lại, chỉ lấy khoảng ngày đầu tiên`)
  }
  // bỏ trùng ngày nghỉ (tệp cũ có thể ghi cả hai kiểu ngoại lệ), ưu tiên tên ghi sau
  const byDate = new Map(holidays.map((h) => [h.date, h]))
  holidays.splice(0, holidays.length, ...[...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)))
  return {
    workingWeekdays: weekdays.length ? weekdays.sort() : base.workingWeekdays,
    intervals: intervals ?? base.intervals,
    holidays,
    extraWorkingDays: extra.length ? extra : undefined,
  }
}

export function importMspdi(xml: string, parser: DOMParser = new DOMParser()): ImportResult {
  const warnings: string[] = []
  const doc = parser.parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'Project') throw new Error('Tệp không phải MS Project XML (thiếu thẻ <Project>)')

  const minPerDay = num(txt(root, 'MinutesPerDay'), 480)
  const calUid = txt(root, 'CalendarUID') ?? '1'
  const cals = kids(child(root, 'Calendars'), 'Calendar')
  const cal = cals.find((c) => txt(c, 'UID') === calUid) ?? cals.find((c) => txt(c, 'IsBaseCalendar') === '1')
  const calendar = parseCalendar(cal, warnings)
  if (minutesPerDay(calendar) !== minPerDay)
    warnings.push(`Số phút mỗi ngày của dự án (${minPerDay}) khác tổng giờ làm trong lịch (${minutesPerDay(calendar)}); thời lượng quy đổi theo ${minPerDay} phút/ngày`)

  const now = nowIso()
  const projectStart = dt(txt(root, 'StartDate')) ?? now.slice(0, 10) + 'T07:30'
  const project: Project = {
    id: newId(),
    code: '',
    name: txt(root, 'Title') || txt(root, 'Name')?.replace(/\.xml$/i, '') || 'Dự án nhập từ MS Project',
    manager: txt(root, 'Manager') || undefined,
    owner: txt(root, 'Company') || undefined,
    status: 'thuc_hien',
    start: projectStart,
    statusDate: txt(root, 'StatusDate')?.slice(0, 10),
    // giữ nguyên lịch như MS Project, người dùng tự bật dời việc theo ngày cập nhật
    rescheduleAfterStatus: false,
    calendar,
    createdAt: now,
    updatedAt: now,
  }

  // Công việc: dựng cây từ OutlineLevel
  const uidToId = new Map<string, string>()
  const tasks: Task[] = []
  const stack: { level: number; id: string }[] = []
  const orderOf = new Map<string | null, number>()
  const baselineEntries: Baseline['entries'] = []
  const rawLinks: { pred: string; succ: string; type: LinkType; lag: number }[] = []
  for (const el of kids(child(root, 'Tasks'), 'Task')) {
    const uid = txt(el, 'UID')!
    const level = num(txt(el, 'OutlineLevel'), 1)
    if (level === 0 || txt(el, 'IsNull') === '1') continue // công việc tổng dự án / dòng trống
    if (txt(el, 'Active') === '0') {
      warnings.push(`Bỏ qua công việc không hoạt động: ${txt(el, 'Name')}`)
      continue
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parentId = stack.length ? stack[stack.length - 1].id : null
    const id = newId()
    uidToId.set(uid, id)
    stack.push({ level, id })
    const order = orderOf.get(parentId) ?? 0
    orderOf.set(parentId, order + 1)

    const durMin = parseIsoDuration(txt(el, 'Duration'))
    const ct = num(txt(el, 'ConstraintType'))
    let constraint: ConstraintType = 'ASAP'
    const cdate = dt(txt(el, 'ConstraintDate'))
    if (ct === 2) constraint = 'MSO'
    else if (ct === 4) constraint = 'SNET'
    else if (ct === 6) constraint = 'FNET'
    else if (ct === 3 || ct === 7) {
      constraint = 'FNET'
      warnings.push(`"${txt(el, 'Name')}": ràng buộc kết thúc (loại ${ct}) được đổi thành "Kết thúc không sớm hơn"`)
    } else if (ct !== 0) warnings.push(`"${txt(el, 'Name')}": ràng buộc loại ${ct} chưa hỗ trợ, coi như Càng sớm càng tốt`)

    const pct = num(txt(el, 'PercentComplete'))
    tasks.push({
      id,
      parentId,
      order,
      name: txt(el, 'Name') ?? '',
      duration: Math.round((durMin / minPerDay) * 1000) / 1000,
      notes: txt(el, 'Notes') || undefined,
      constraint,
      constraintDate: constraint === 'ASAP' ? undefined : cdate,
      percentComplete: pct,
      actualStart: pct > 0 ? dt(txt(el, 'ActualStart')) : undefined,
      actualFinish: pct >= 100 ? dt(txt(el, 'ActualFinish')) : undefined,
      fixedCost: num(txt(el, 'FixedCost')) / 100 || undefined,
    })
    for (const pl of kids(el, 'PredecessorLink')) {
      const lagFmt = num(txt(pl, 'LagFormat'), 7)
      if ([19, 20].includes(lagFmt)) warnings.push(`"${txt(el, 'Name')}": thời gian chờ theo % chưa hỗ trợ, bỏ qua`)
      const lagMin = [19, 20].includes(lagFmt) ? 0 : num(txt(pl, 'LinkLag')) / 10
      rawLinks.push({
        pred: txt(pl, 'PredecessorUID')!,
        succ: uid,
        type: LINK_TYPES[txt(pl, 'Type') ?? '1'] ?? 'FS',
        lag: Math.round((lagMin / minPerDay) * 1000) / 1000,
      })
    }
    const bl = kids(el, 'Baseline').find((b) => txt(b, 'Number') === '0')
    if (bl && txt(bl, 'Start') && txt(bl, 'Finish')) {
      baselineEntries.push({
        taskId: id,
        start: dt(txt(bl, 'Start'))!,
        finish: dt(txt(bl, 'Finish'))!,
        duration: txt(bl, 'Duration') ? parseIsoDuration(txt(bl, 'Duration')) / minPerDay : Math.round((durMin / minPerDay) * 1000) / 1000,
        cost: num(txt(bl, 'Cost')) / 100,
      })
    }
  }
  const links: Link[] = []
  for (const l of rawLinks) {
    const a = uidToId.get(l.pred)
    const b = uidToId.get(l.succ)
    if (!a || !b) {
      warnings.push('Bỏ qua một liên kết tới công việc không có trong tệp')
      continue
    }
    links.push({ id: newId(), predecessorId: a, successorId: b, type: l.type, lag: l.lag })
  }

  // Nguồn lực
  const resUid = new Map<string, string>()
  const resources: Resource[] = []
  for (const el of kids(child(root, 'Resources'), 'Resource')) {
    const uid = txt(el, 'UID')!
    const name = txt(el, 'Name')
    if (!name || txt(el, 'IsNull') === '1') continue
    const type = txt(el, 'IsCostResource') === '1' ? 'cost' : RES_TYPES[txt(el, 'Type') ?? '1'] ?? 'work'
    const rate = num(txt(el, 'StandardRate'))
    const id = newId()
    resUid.set(uid, id)
    resources.push({
      id,
      name,
      type,
      unit: type === 'material' ? txt(el, 'MaterialLabel') || undefined : 'công',
      // MSPDI: nhân công tính theo giờ, vật tư theo đơn vị
      rate: type === 'work' ? Math.round(rate * (minPerDay / 60) * 100) / 100 : rate,
      costPerUse: num(txt(el, 'CostPerUse')) / 100,
      group: txt(el, 'Group') || undefined,
    })
  }
  const resById = new Map(resources.map((r) => [r.id, r]))
  const assignments: Assignment[] = []
  for (const el of kids(child(root, 'Assignments'), 'Assignment')) {
    const taskId = uidToId.get(txt(el, 'TaskUID') ?? '')
    const resourceId = resUid.get(txt(el, 'ResourceUID') ?? '')
    if (!taskId || !resourceId) continue
    const r = resById.get(resourceId)!
    const units = r.type === 'cost' ? num(txt(el, 'Cost')) / 100 : num(txt(el, 'Units'), 1)
    assignments.push({ id: newId(), taskId, resourceId, units })
  }

  const baselines: Baseline[] = baselineEntries.length
    ? [{ id: newId(), name: 'Kế hoạch gốc (từ MS Project)', createdAt: now, entries: baselineEntries }]
    : []
  return { data: { project, tasks, links, resources, assignments, baselines }, warnings }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Xuất MS Project XML để mở bằng MS Project / ProjectLibre */
export function exportMspdi(data: ProjectData): string {
  const { project, tasks, links, resources, assignments } = data
  const sched = schedule(project, tasks, links)
  const mpd = sched.minutesPerDay
  const tree = sched.tree
  const uid = new Map<string, number>()
  tree.ordered.forEach((t, i) => uid.set(t.id, i + 1))
  const resUid = new Map<string, number>()
  resources.forEach((r, i) => resUid.set(r.id, i + 1))
  const sec = (s: string) => `${s.slice(0, 16)}:00`
  const cal = project.calendar
  const lines: string[] = []
  const tag = (name: string, v: string | number | undefined) => (v === undefined ? '' : `<${name}>${typeof v === 'string' ? esc(v) : v}</${name}>`)

  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">')
  lines.push(tag('SaveVersion', 14) + tag('Name', `${project.name}.xml`) + tag('Title', project.name))
  if (project.manager) lines.push(tag('Manager', project.manager))
  if (project.owner) lines.push(tag('Company', project.owner))
  lines.push(tag('ScheduleFromStart', 1) + tag('StartDate', sec(project.start)) + tag('FinishDate', sec(sched.projectFinish)))
  lines.push(tag('CalendarUID', 1) + tag('MinutesPerDay', mpd) + tag('MinutesPerWeek', mpd * cal.workingWeekdays.length) + tag('DaysPerMonth', 26))
  lines.push(tag('DefaultStartTime', `${cal.intervals[0].from}:00`) + tag('DefaultFinishTime', `${cal.intervals[cal.intervals.length - 1].to}:00`))
  if (project.statusDate) lines.push(tag('StatusDate', `${project.statusDate}T17:00:00`))
  lines.push(tag('CurrencySymbol', '₫') + tag('CurrencyCode', 'VND') + tag('NewTasksAreManual', 0))

  // Lịch
  lines.push('<Calendars><Calendar><UID>1</UID><Name>Lịch công trường</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>')
  for (let d = 0; d < 7; d++) {
    const working = cal.workingWeekdays.includes(d)
    lines.push(`<WeekDay><DayType>${d + 1}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>`)
    if (working) {
      lines.push('<WorkingTimes>' + cal.intervals.map((iv) => `<WorkingTime><FromTime>${iv.from}:00</FromTime><ToTime>${iv.to === '24:00' ? '00:00' : iv.to}:00</ToTime></WorkingTime>`).join('') + '</WorkingTimes>')
    }
    lines.push('</WeekDay>')
  }
  lines.push('</WeekDays><Exceptions>')
  for (const h of cal.holidays) {
    lines.push(`<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${h.date}T00:00:00</FromDate><ToDate>${h.date}T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences>${tag('Name', h.name)}<Type>1</Type><DayWorking>0</DayWorking></Exception>`)
  }
  for (const d of cal.extraWorkingDays ?? []) {
    lines.push(`<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${d}T00:00:00</FromDate><ToDate>${d}T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences><Name>Ngày làm bù</Name><Type>1</Type><DayWorking>1</DayWorking><WorkingTimes>` +
      cal.intervals.map((iv) => `<WorkingTime><FromTime>${iv.from}:00</FromTime><ToTime>${iv.to}:00</ToTime></WorkingTime>`).join('') + '</WorkingTimes></Exception>')
  }
  lines.push('</Exceptions></Calendar></Calendars>')

  // Công việc
  const constraintCode: Record<ConstraintType, number> = { ASAP: 0, MSO: 2, SNET: 4, FNET: 6 }
  const baseline = data.baselines[data.baselines.length - 1]
  const blMap = new Map(baseline?.entries.map((e) => [e.taskId, e]))
  lines.push('<Tasks>')
  tree.ordered.forEach((t, i) => {
    const s = sched.tasks.get(t.id)!
    const isSum = tree.isSummary(t.id)
    const parts = [
      tag('UID', uid.get(t.id)), tag('ID', i + 1), tag('Name', t.name), tag('Type', 0), tag('IsNull', 0),
      tag('WBS', s.wbs), tag('OutlineNumber', s.wbs), tag('OutlineLevel', (tree.level.get(t.id) ?? 0) + 1),
      tag('Start', sec(s.start)), tag('Finish', sec(s.finish)),
      tag('Duration', toIsoDuration((isSum ? s.duration : t.duration) * mpd)), tag('DurationFormat', 7),
      tag('Manual', 0), tag('Milestone', s.isMilestone ? 1 : 0), tag('Summary', isSum ? 1 : 0), tag('Critical', s.critical ? 1 : 0),
      tag('PercentComplete', Math.round(s.percentComplete)),
      tag('ConstraintType', constraintCode[t.constraint]),
    ]
    if (t.constraint !== 'ASAP' && t.constraintDate) parts.push(tag('ConstraintDate', sec(t.constraintDate)))
    if (t.actualStart) parts.push(tag('ActualStart', sec(t.actualStart)))
    if (t.actualFinish) parts.push(tag('ActualFinish', sec(t.actualFinish)))
    if (t.fixedCost) parts.push(tag('FixedCost', Math.round(t.fixedCost * 100)))
    if (t.notes) parts.push(tag('Notes', t.notes))
    for (const l of links.filter((x) => x.successorId === t.id)) {
      if (!uid.has(l.predecessorId)) continue
      parts.push(`<PredecessorLink><PredecessorUID>${uid.get(l.predecessorId)}</PredecessorUID><Type>${LINK_CODES[l.type]}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(l.lag * mpd * 10)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`)
    }
    const b = blMap.get(t.id)
    if (b) parts.push(`<Baseline><Number>0</Number>${tag('Start', sec(b.start))}${tag('Finish', sec(b.finish))}${tag('Duration', toIsoDuration(b.duration * mpd))}${tag('Cost', Math.round(b.cost * 100))}</Baseline>`)
    lines.push(`<Task>${parts.join('')}</Task>`)
  })
  lines.push('</Tasks><Resources>')
  for (const r of resources) {
    const rate = r.type === 'work' ? r.rate / (mpd / 60) : r.rate
    lines.push(`<Resource>${tag('UID', resUid.get(r.id))}${tag('ID', resUid.get(r.id))}${tag('Name', r.name)}${tag('Type', RES_CODES[r.type])}${r.type === 'cost' ? '<IsCostResource>1</IsCostResource>' : ''}<IsNull>0</IsNull>` +
      (r.type === 'material' && r.unit ? tag('MaterialLabel', r.unit) : '') + (r.group ? tag('Group', r.group) : '') +
      `${tag('StandardRate', Math.round(rate * 10000) / 10000)}<StandardRateFormat>${r.type === 'work' ? 3 : 8}</StandardRateFormat>${tag('CostPerUse', Math.round(r.costPerUse * 100))}</Resource>`)
  }
  lines.push('</Resources><Assignments>')
  assignments.forEach((a, i) => {
    const r = resources.find((x) => x.id === a.resourceId)
    if (!r || !uid.has(a.taskId)) return
    const t = tree.byId.get(a.taskId)!
    const unitsPart = r.type === 'cost' ? `<Units>1</Units>${tag('Cost', Math.round(a.units * 100))}` : tag('Units', a.units)
    const work = r.type === 'work' ? a.units * t.duration * mpd : r.type === 'material' ? a.units * 60 : 0
    lines.push(`<Assignment>${tag('UID', i + 1)}${tag('TaskUID', uid.get(a.taskId))}${tag('ResourceUID', resUid.get(a.resourceId))}${unitsPart}${tag('Work', toIsoDuration(work))}</Assignment>`)
  })
  lines.push('</Assignments></Project>')
  return lines.join('\n')
}
