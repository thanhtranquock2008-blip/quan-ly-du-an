// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeCosts, resourceLabel } from '../cost'
import { schedule } from '../cpm'
import { exportMspdi, importMspdi } from '../mspdi'
import type { ProjectData } from '../types'

// Đối chiếu với bài tập MS Project trên Drive:
//  - Vi du 7A: tệp "10.12.2024 - Bai tap tren lop.mpp" (chuyển sang XML bằng MPXJ)
//  - VD-8B: cùng các công việc, bắt đầu 16/12/2024

const xml = readFileSync(join(__dirname, '../../samples/vi-du-7a.xml'), 'utf-8')

function rows(data: ProjectData) {
  const s = schedule(data.project, data.tasks, data.links)
  const c = computeCosts(data.tasks, data.resources, data.assignments, s)
  return {
    s, c,
    list: s.tree.ordered.map((t) => ({
      name: t.name,
      duration: t.duration,
      start: s.tasks.get(t.id)!.start,
      finish: s.tasks.get(t.id)!.finish,
      cost: c.byTask.get(t.id),
      res: resourceLabel(t.id, data.resources, data.assignments),
    })),
  }
}

describe('Vi du 7A (tệp .mpp bài tập trên lớp)', () => {
  const { data, warnings } = importMspdi(xml)

  it('đọc đúng lịch: thứ Hai - thứ Bảy, 2 ca, nghỉ 01/01/2025', () => {
    expect(data.project.start).toBe('2024-12-23T08:00')
    expect(data.project.calendar.workingWeekdays).toEqual([1, 2, 3, 4, 5, 6])
    expect(data.project.calendar.intervals).toEqual([{ from: '07:30', to: '11:30' }, { from: '13:30', to: '17:30' }])
    expect(data.project.calendar.holidays).toEqual([{ date: '2025-01-01', name: 'Ngày nghỉ lễ' }])
    expect(warnings).toEqual([])
  })

  it('ngày bắt đầu, kết thúc trùng với MS Project', () => {
    const { list, s } = rows(data)
    expect(list.map(({ name, duration, start, finish }) => ({ name, duration, start, finish }))).toEqual([
      { name: 'Cột mốc bắt đầu', duration: 0, start: '2024-12-23T08:00', finish: '2024-12-23T08:00' },
      { name: 'Gia công lắp dựng cốt pha', duration: 10, start: '2024-12-23T08:00', finish: '2025-01-04T08:00' },
      { name: 'Đổ bê tông', duration: 1, start: '2025-01-04T08:00', finish: '2025-01-06T08:00' },
      { name: 'Vệ sinh', duration: 1, start: '2025-01-06T08:00', finish: '2025-01-07T08:00' },
      { name: 'Cột mốc kết thúc', duration: 0, start: '2025-01-07T08:00', finish: '2025-01-07T08:00' },
    ])
    expect(s.projectFinish).toBe('2025-01-07T08:00')
    expect(s.projectDuration).toBe(12)
  })

  it('chi phí trùng với MS Project (121.100.000 ₫)', () => {
    const { list, c } = rows(data)
    expect(list.map((r) => r.cost)).toEqual([0, 56_400_000, 63_500_000, 1_200_000, 0])
    expect(c.total).toBe(121_100_000)
    expect(list[1].res).toBe('Công nhân cốt pha [4], Ván khuôn [480 m2]')
    expect(list[2].res).toBe('Công nhân bê tông [4], Bê tông [40 m3], Chi phí [2.000.000]')
    expect(list[3].res).toBe('Khoán [1.200.000]')
  })

  it('đường găng đi qua cốt pha → bê tông → vệ sinh', () => {
    const { s, list } = rows(data)
    const crit = s.tree.ordered.filter((t) => s.tasks.get(t.id)!.critical).map((t) => t.name)
    expect(crit).toEqual(['Gia công lắp dựng cốt pha', 'Đổ bê tông', 'Vệ sinh', 'Cột mốc kết thúc'])
    expect(list.length).toBe(5)
  })

  it('xuất lại XML rồi nhập vẫn giữ nguyên ngày và chi phí', () => {
    const again = importMspdi(exportMspdi(data))
    expect(again.warnings).toEqual([])
    const a = rows(data).list
    const b = rows(again.data).list
    expect(b).toEqual(a)
  })
})

describe('VD-8B (bắt đầu 16/12/2024)', () => {
  it('ngày trùng với bản in MS Project', () => {
    const { data } = importMspdi(xml)
    data.project.start = '2024-12-16T08:00'
    for (const t of data.tasks) {
      t.percentComplete = 0
      t.actualStart = t.actualFinish = undefined
    }
    const { list } = rows(data)
    expect(list.map((r) => [r.start.slice(0, 10), r.finish.slice(0, 10)])).toEqual([
      ['2024-12-16', '2024-12-16'],
      ['2024-12-16', '2024-12-27'],
      ['2024-12-27', '2024-12-28'],
      ['2024-12-28', '2024-12-30'],
      ['2024-12-30', '2024-12-30'],
    ])
  })
})
