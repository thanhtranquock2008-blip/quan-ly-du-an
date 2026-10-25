import { describe, expect, it } from 'vitest'
import { CalendarIndex } from '../calendar'
import { CycleError, schedule } from '../cpm'
import { defaultCalendar } from '../holidays'
import { mkLink, mkProject, mkTask } from './helpers'

const pick = (r: ReturnType<typeof schedule>, id: string) => {
  const t = r.tasks.get(id)!
  return { es: t.es, ef: t.ef, ls: t.ls, lf: t.lf, tf: t.tf, ff: t.ff, critical: t.critical }
}

describe('CPM cơ bản (sơ đồ AON, quan hệ FS)', () => {
  // A(3) B(4); C(2), D(5) sau A; E(3) sau B, C; F(4) sau D, E
  const tasks = [mkTask('A', 3), mkTask('B', 4), mkTask('C', 2), mkTask('D', 5), mkTask('E', 3), mkTask('F', 4)]
  const links = [mkLink('A', 'C'), mkLink('A', 'D'), mkLink('B', 'E'), mkLink('C', 'E'), mkLink('D', 'F'), mkLink('E', 'F')]
  const r = schedule(mkProject('2025-03-03T07:30'), tasks, links)

  it('tính ES, EF, LS, LF, TF, FF đúng như tính tay', () => {
    expect(pick(r, 'A')).toEqual({ es: 0, ef: 3, ls: 0, lf: 3, tf: 0, ff: 0, critical: true })
    expect(pick(r, 'B')).toEqual({ es: 0, ef: 4, ls: 1, lf: 5, tf: 1, ff: 1, critical: false })
    expect(pick(r, 'C')).toEqual({ es: 3, ef: 5, ls: 3, lf: 5, tf: 0, ff: 0, critical: true })
    expect(pick(r, 'D')).toEqual({ es: 3, ef: 8, ls: 3, lf: 8, tf: 0, ff: 0, critical: true })
    expect(pick(r, 'E')).toEqual({ es: 5, ef: 8, ls: 5, lf: 8, tf: 0, ff: 0, critical: true })
    expect(pick(r, 'F')).toEqual({ es: 8, ef: 12, ls: 8, lf: 12, tf: 0, ff: 0, critical: true })
    expect(r.projectDuration).toBe(12)
  })

  it('đổi ra ngày theo lịch', () => {
    expect(r.tasks.get('A')!.start).toBe('2025-03-03T07:30')
    expect(r.tasks.get('A')!.finish).toBe('2025-03-05T17:30')
    expect(r.tasks.get('C')!.start).toBe('2025-03-06T07:30')
    expect(r.projectFinish).toBe('2025-03-14T17:30')
  })
})

describe('Các loại quan hệ SS, FF, SF và thời gian chờ', () => {
  it('SS + lag, FF + lag', () => {
    const r = schedule(mkProject('2025-03-03T07:30'),
      [mkTask('A', 4), mkTask('B', 6), mkTask('C', 3)],
      [mkLink('A', 'B', 'SS', 2), mkLink('B', 'C', 'FF', 1)])
    expect(pick(r, 'B')).toMatchObject({ es: 2, ef: 8 })
    expect(pick(r, 'C')).toMatchObject({ es: 6, ef: 9, tf: 0 })
    // A chỉ ràng buộc qua SS: được trễ đến khi B phải bắt đầu
    expect(pick(r, 'A')).toMatchObject({ ls: 0, lf: 4, tf: 0 })
  })

  it('gối đầu (lag âm) và SF', () => {
    const r = schedule(mkProject('2025-03-03T07:30'),
      [mkTask('A', 5), mkTask('B', 3), mkTask('C', 2)],
      [mkLink('A', 'B', 'FS', -2), mkLink('A', 'C', 'SF', 4)])
    expect(pick(r, 'B')).toMatchObject({ es: 3, ef: 6 })
    expect(pick(r, 'C')).toMatchObject({ es: 2, ef: 4 })
  })

  it('nửa ngày', () => {
    const r = schedule(mkProject('2025-03-03T07:30'), [mkTask('A', 0.5), mkTask('B', 1)], [mkLink('A', 'B')])
    expect(r.tasks.get('A')!.finish).toBe('2025-03-03T11:30')
    expect(r.tasks.get('B')!.start).toBe('2025-03-03T13:30')
    expect(r.tasks.get('B')!.finish).toBe('2025-03-04T11:30')
  })
})

describe('Ràng buộc và vòng kín', () => {
  it('SNET đẩy ngày bắt đầu, tạo dự trữ cho việc khác', () => {
    const r = schedule(mkProject('2025-03-03T07:30'),
      [mkTask('A', 2), mkTask('B', 2, { constraint: 'SNET', constraintDate: '2025-03-07T07:30' })], [])
    expect(pick(r, 'B')).toMatchObject({ es: 4, ef: 6 })
    expect(pick(r, 'A')).toMatchObject({ tf: 4 })
  })

  it('báo lỗi khi liên kết vòng kín', () => {
    expect(() => schedule(mkProject('2025-03-03T07:30'),
      [mkTask('A', 1), mkTask('B', 1), mkTask('C', 1)],
      [mkLink('A', 'B'), mkLink('B', 'C'), mkLink('C', 'A')])).toThrow(CycleError)
  })
})

describe('Hạng mục tổng hợp (WBS)', () => {
  it('cộng dồn ngày và liên kết tới hạng mục áp cho mọi việc con', () => {
    const tasks = [
      mkTask('M', 0, { name: 'Móng' }),
      mkTask('M1', 3, { parentId: 'M' }),
      mkTask('M2', 2, { parentId: 'M' }),
      mkTask('T', 0, { name: 'Thân' }),
      mkTask('T1', 4, { parentId: 'T' }),
    ]
    const r = schedule(mkProject('2025-03-03T07:30'), tasks, [mkLink('M1', 'M2'), mkLink('M', 'T')])
    expect(r.tasks.get('M')).toMatchObject({ isSummary: true, es: 0, ef: 5, wbs: '1' })
    expect(r.tasks.get('M2')!.wbs).toBe('1.2')
    expect(pick(r, 'T1')).toMatchObject({ es: 5, ef: 9, critical: true })
  })
})

describe('Theo dõi thực tế', () => {
  const cal = { ...defaultCalendar(), workingWeekdays: [0, 1, 2, 3, 4, 5, 6] }
  it('việc chưa bắt đầu bị dời ra sau ngày cập nhật', () => {
    const r = schedule(mkProject('2025-03-03T07:30', cal, { statusDate: '2025-03-04' }), [mkTask('A', 2)], [])
    expect(r.tasks.get('A')!.start).toBe('2025-03-05T07:30')
  })
  it('việc đang làm: phần còn lại dời sau ngày cập nhật', () => {
    // bắt đầu 03/03, làm 4 ngày, cập nhật cuối ngày 04/03 mới được 25% (1 ngày) → còn 3 ngày từ 05/03
    const r = schedule(mkProject('2025-03-03T07:30', cal, { statusDate: '2025-03-04' }),
      [mkTask('A', 4, { actualStart: '2025-03-03T07:30', percentComplete: 25 })], [])
    expect(r.tasks.get('A')!.finish).toBe('2025-03-07T17:30')
    expect(r.tasks.get('A')!.duration).toBe(5)
  })
  it('việc đã xong lấy ngày thực tế', () => {
    const r = schedule(mkProject('2025-03-03T07:30', cal), [mkTask('A', 4, { actualStart: '2025-03-03T07:30', actualFinish: '2025-03-04T17:30', percentComplete: 100 }), mkTask('B', 1)], [mkLink('A', 'B')])
    expect(r.tasks.get('B')!.start).toBe('2025-03-05T07:30')
    expect(r.tasks.get('A')!.critical).toBe(false)
  })
})

describe('Lịch làm việc', () => {
  it('bỏ qua Chủ nhật và ngày lễ Tết 2025', () => {
    const c = new CalendarIndex(defaultCalendar([2025]), '2025-01-27T07:30')
    // 27/01 (T2) làm, 28/01 (30 Tết) đến 01/02 nghỉ, 02/02 CN nghỉ → ngày làm thứ 2 là 03/02
    expect(c.addWorkingDays('2025-01-27T07:30', 2)).toBe('2025-02-03T17:30')
  })
  it('quy đổi qua lại phút làm việc', () => {
    const c = new CalendarIndex(defaultCalendar(), '2024-12-23T08:00')
    const p = c.toMinutes('2024-12-23T08:00')
    expect(c.toDate(p, 'start')).toBe('2024-12-23T08:00')
    expect(c.toDate(c.toMinutes('2024-12-23T11:30'), 'start')).toBe('2024-12-23T13:30')
    expect(c.toDate(c.toMinutes('2024-12-23T11:30'), 'finish')).toBe('2024-12-23T11:30')
    expect(c.toDate(c.toMinutes('2024-12-28T17:30'), 'start')).toBe('2024-12-30T07:30')
  })
})

describe('Hiệu năng', () => {
  it('2.000 công việc tính dưới 1 giây', () => {
    const n = 2000
    const tasks = Array.from({ length: n }, (_, i) => mkTask(`t${i}`, 1 + (i % 5)))
    const links = []
    for (let i = 1; i < n; i++) {
      links.push(mkLink(`t${i - 1}`, `t${i}`, i % 7 === 0 ? 'SS' : 'FS', i % 3))
      if (i > 10 && i % 4 === 0) links.push(mkLink(`t${i - 10}`, `t${i}`))
    }
    const t0 = performance.now()
    const r = schedule(mkProject('2025-03-03T07:30', defaultCalendar([2025, 2026, 2027, 2028])), tasks, links)
    const ms = performance.now() - t0
    expect(r.tasks.size).toBe(n)
    expect(ms).toBeLessThan(1000)
  })
})
