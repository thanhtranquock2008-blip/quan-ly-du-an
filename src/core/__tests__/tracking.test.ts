import { describe, expect, it } from 'vitest'
import { schedule } from '../cpm'
import { defaultCalendar } from '../holidays'
import { formatPredecessors, parsePredecessors } from '../predecessors'
import { createBaseline, trackProgress } from '../tracking'
import type { ProjectData } from '../types'
import { mkLink, mkProject, mkTask } from './helpers'

describe('Cột việc trước', () => {
  it('đọc kiểu MS Project và viết tắt tiếng Việt', () => {
    expect(parsePredecessors('2, 3SS+2; 5ff-1,6bb')).toEqual([
      { row: 2, type: 'FS', lag: 0 },
      { row: 3, type: 'SS', lag: 2 },
      { row: 5, type: 'FF', lag: -1 },
      { row: 6, type: 'SS', lag: 0 },
    ])
    expect(() => parsePredecessors('abc')).toThrow(/Không hiểu/)
  })
  it('viết lại đúng định dạng', () => {
    const rowOf = new Map([['a', 1], ['b', 2], ['c', 3]])
    expect(formatPredecessors('c', [mkLink('a', 'c'), mkLink('b', 'c', 'SS', 2)], rowOf)).toBe('1, 2SS+2')
  })
})

describe('Theo dõi so với kế hoạch gốc', () => {
  const cal = { ...defaultCalendar(), workingWeekdays: [0, 1, 2, 3, 4, 5, 6] }
  const base: ProjectData = {
    project: mkProject('2025-03-03T07:30', cal),
    tasks: [mkTask('A', 4), mkTask('B', 2)],
    links: [mkLink('A', 'B')],
    resources: [], assignments: [], baselines: [],
  }
  const bl = createBaseline(base, 'Gốc')

  it('việc trễ đẩy việc sau và báo lệch ngày', () => {
    const d: ProjectData = {
      ...base,
      project: { ...base.project, statusDate: '2025-03-06' },
      tasks: [mkTask('A', 4, { actualStart: '2025-03-03T07:30', percentComplete: 50 }), mkTask('B', 2)],
    }
    const rows = trackProgress(d, bl)
    const a = rows.find((r) => r.taskId === 'A')!
    const b = rows.find((r) => r.taskId === 'B')!
    // đến hết 06/03 lẽ ra xong 100%, thực tế 50% → còn 2 ngày từ 07/03
    expect(a.status).toBe('tre_han')
    expect(a.finish).toBe('2025-03-08T17:30')
    expect(a.finishVariance).toBe(2)
    expect(b.finishVariance).toBe(2)
    expect(b.status).toBe('chua_bat_dau')
  })

  it('đúng kế hoạch thì không lệch', () => {
    const rows = trackProgress({ ...base, project: { ...base.project, statusDate: '2025-03-02' } }, bl, schedule(base.project, base.tasks, base.links))
    expect(rows.every((r) => r.finishVariance === 0)).toBe(true)
  })
})
