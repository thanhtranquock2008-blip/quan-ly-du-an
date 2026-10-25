import type { Link, LinkType, Project, Task, WorkCalendar } from '../types'

export const ALL_DAYS: WorkCalendar = {
  workingWeekdays: [0, 1, 2, 3, 4, 5, 6],
  intervals: [{ from: '07:30', to: '11:30' }, { from: '13:30', to: '17:30' }],
  holidays: [],
}

export function mkProject(start: string, calendar: WorkCalendar = ALL_DAYS, extra: Partial<Project> = {}): Project {
  return {
    id: 'p', code: 'P', name: 'Thử', status: 'thuc_hien', start, calendar,
    createdAt: '', updatedAt: '', ...extra,
  }
}

let order = 0
export function mkTask(id: string, duration: number, extra: Partial<Task> = {}): Task {
  return { id, parentId: null, order: order++, name: id, duration, constraint: 'ASAP', percentComplete: 0, ...extra }
}

export function mkLink(pred: string, succ: string, type: LinkType = 'FS', lag = 0): Link {
  return { id: `${pred}-${succ}`, predecessorId: pred, successorId: succ, type, lag }
}
