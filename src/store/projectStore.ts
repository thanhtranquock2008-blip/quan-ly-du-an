import { create } from 'zustand'
import { schedule } from '../core/cpm'
import { newId, nowIso } from '../core/id'
import type { Assignment, Baseline, Link, Project, ProjectData, Resource, Task } from '../core/types'
import { buildTree, descendantsOf } from '../core/wbs'
import type { MemberRole, Repo } from '../data/repo'

// Trạng thái dự án đang mở, có hoàn tác / làm lại và tự lưu.

const HISTORY_LIMIT = 100
const SAVE_DELAY = 800

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

interface State {
  repo: Repo | null
  data: ProjectData | null
  past: ProjectData[]
  future: ProjectData[]
  saveState: SaveState
  saveError?: string
  readOnly: boolean
  role?: MemberRole

  setRepo(repo: Repo): void
  open(data: ProjectData, readOnly?: boolean, role?: MemberRole): void
  /** Cập nhật % hoàn thành / ngày thực tế; nhà thầu (chỉ xem) đi qua RPC riêng */
  progress(id: string, patch: Pick<Partial<Task>, 'percentComplete' | 'actualStart' | 'actualFinish'>): Promise<void>
  canProgress(): boolean
  close(): Promise<void>
  /** Áp một thay đổi, ghi lịch sử hoàn tác */
  apply(fn: (d: ProjectData) => ProjectData): void
  undo(): void
  redo(): void
  flush(): Promise<void>

  updateProject(patch: Partial<Project>): void
  addTask(afterId: string | null, asChild?: boolean, patch?: Partial<Task>): string
  updateTask(id: string, patch: Partial<Task>): void
  updateTasks(patches: { id: string; patch: Partial<Task> }[]): void
  deleteTasks(ids: string[]): void
  indent(id: string): void
  outdent(id: string): void
  move(id: string, dir: -1 | 1): void
  setPredecessors(taskId: string, preds: Omit<Link, 'id' | 'successorId'>[]): void
  addLink(link: Omit<Link, 'id'>): void
  updateLink(id: string, patch: Partial<Link>): void
  deleteLink(id: string): void
  upsertResource(r: Resource): void
  deleteResource(id: string): void
  setAssignments(taskId: string, list: Omit<Assignment, 'taskId'>[]): void
  addBaseline(b: Baseline): void
  deleteBaseline(id: string): void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

/** Đánh lại thứ tự các con của một cha theo danh sách */
function reorder(tasks: Task[], parentId: string | null, orderedIds: string[]): Task[] {
  const pos = new Map(orderedIds.map((id, i) => [id, i]))
  return tasks.map((t) => ((t.parentId ?? null) === parentId && pos.has(t.id) ? { ...t, order: pos.get(t.id)! } : t))
}

function siblings(tasks: Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => (t.parentId ?? null) === parentId).sort((a, b) => a.order - b.order)
}

export const useProject = create<State>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY)
  }

  return {
    repo: null,
    data: null,
    past: [],
    future: [],
    saveState: 'saved',
    readOnly: false,

    setRepo: (repo) => set({ repo }),
    open: (data, readOnly = false, role) => set({ data, past: [], future: [], saveState: 'saved', saveError: undefined, readOnly, role }),
    canProgress: () => !get().readOnly || (get().role === 'nha_thau' && !!get().repo?.updateProgress),
    async progress(id, patch) {
      const { readOnly, repo, data } = get()
      if (!readOnly) return get().updateTask(id, patch)
      if (!data || !repo?.updateProgress || get().role !== 'nha_thau') return
      const t = data.tasks.find((x) => x.id === id)
      if (!t) return
      const next = { ...t, ...patch }
      await repo.updateProgress(id, next.percentComplete, next.actualStart, next.actualFinish)
      set({ data: { ...data, tasks: data.tasks.map((x) => (x.id === id ? next : x)) } })
    },
    close: async () => {
      await get().flush()
      set({ data: null, past: [], future: [] })
    },

    apply(fn) {
      const { data, past, readOnly } = get()
      if (!data || readOnly) return
      const next = fn(data)
      if (next === data) return
      // không cho lưu thay đổi tạo vòng kín liên kết; lỗi được ném ra cho giao diện báo
      schedule(next.project, next.tasks, next.links)
      next.project = { ...next.project, updatedAt: nowIso() }
      set({ data: next, past: [...past.slice(-HISTORY_LIMIT + 1), data], future: [], saveState: 'dirty' })
      scheduleSave()
    },
    undo() {
      const { data, past, future } = get()
      if (!data || !past.length) return
      set({ data: past[past.length - 1], past: past.slice(0, -1), future: [data, ...future], saveState: 'dirty' })
      scheduleSave()
    },
    redo() {
      const { data, past, future } = get()
      if (!data || !future.length) return
      set({ data: future[0], past: [...past, data], future: future.slice(1), saveState: 'dirty' })
      scheduleSave()
    },
    async flush() {
      clearTimeout(saveTimer)
      const { data, repo, saveState } = get()
      if (!data || !repo || saveState === 'saved' || saveState === 'saving') return
      set({ saveState: 'saving' })
      try {
        await repo.saveProject(data)
        // có thể đã có thay đổi mới trong lúc lưu
        set({ saveState: get().data === data ? 'saved' : 'dirty', saveError: undefined })
        if (get().data !== data) scheduleSave()
      } catch (e) {
        set({ saveState: 'error', saveError: (e as Error).message })
      }
    },

    updateProject: (patch) => get().apply((d) => ({ ...d, project: { ...d.project, ...patch } })),

    addTask(afterId, asChild = false, patch = {}) {
      const id = newId()
      get().apply((d) => {
        const after = afterId ? d.tasks.find((t) => t.id === afterId) : undefined
        const parentId = asChild && after ? after.id : after ? after.parentId ?? null : null
        const sibs = siblings(d.tasks, parentId).map((t) => t.id)
        const at = asChild || !after ? sibs.length : sibs.indexOf(after.id) + 1
        sibs.splice(at, 0, id)
        const task: Task = {
          id, parentId, order: at, name: 'Công việc mới', duration: 1, constraint: 'ASAP', percentComplete: 0, ...patch,
        }
        return { ...d, tasks: reorder([...d.tasks, task], parentId, sibs) }
      })
      return id
    },

    updateTask: (id, patch) => get().updateTasks([{ id, patch }]),
    updateTasks: (patches) =>
      get().apply((d) => {
        const m = new Map(patches.map((p) => [p.id, p.patch]))
        return { ...d, tasks: d.tasks.map((t) => (m.has(t.id) ? { ...t, ...m.get(t.id) } : t)) }
      }),

    deleteTasks: (ids) =>
      get().apply((d) => {
        const tree = buildTree(d.tasks)
        const gone = new Set(ids.flatMap((id) => [id, ...descendantsOf(tree, id)]))
        return {
          ...d,
          tasks: d.tasks.filter((t) => !gone.has(t.id)),
          links: d.links.filter((l) => !gone.has(l.predecessorId) && !gone.has(l.successorId)),
          assignments: d.assignments.filter((a) => !gone.has(a.taskId)),
        }
      }),

    indent: (id) =>
      get().apply((d) => {
        const t = d.tasks.find((x) => x.id === id)
        if (!t) return d
        const sibs = siblings(d.tasks, t.parentId ?? null)
        const i = sibs.findIndex((s) => s.id === id)
        if (i <= 0) return d
        const newParent = sibs[i - 1]
        const newSibs = siblings(d.tasks, newParent.id)
        const tasks = d.tasks.map((x) => (x.id === id ? { ...x, parentId: newParent.id, order: newSibs.length } : x))
        // hạng mục tổng hợp không gắn nguồn lực và liên kết trực tiếp tới việc con của chính nó
        return {
          ...d,
          tasks,
          links: d.links.filter((l) => !((l.predecessorId === newParent.id && l.successorId === id) || (l.successorId === newParent.id && l.predecessorId === id))),
          assignments: d.assignments.filter((a) => a.taskId !== newParent.id),
        }
      }),

    outdent: (id) =>
      get().apply((d) => {
        const t = d.tasks.find((x) => x.id === id)
        if (!t || !t.parentId) return d
        const parent = d.tasks.find((x) => x.id === t.parentId)!
        const grand = parent.parentId ?? null
        const sibs = siblings(d.tasks, grand).map((s) => s.id)
        sibs.splice(sibs.indexOf(parent.id) + 1, 0, id)
        // các việc đứng sau trong cùng cha trở thành con của việc vừa thụt ra (giống MS Project)
        const after = siblings(d.tasks, parent.id).filter((s) => s.order > t.order)
        let tasks = d.tasks.map((x) => (x.id === id ? { ...x, parentId: grand } : x))
        const existingKids = siblings(tasks, id).length
        tasks = tasks.map((x) => {
          const k = after.findIndex((a) => a.id === x.id)
          return k >= 0 ? { ...x, parentId: id, order: existingKids + k } : x
        })
        return { ...d, tasks: reorder(tasks, grand, sibs) }
      }),

    move: (id, dir) =>
      get().apply((d) => {
        const t = d.tasks.find((x) => x.id === id)
        if (!t) return d
        const sibs = siblings(d.tasks, t.parentId ?? null).map((s) => s.id)
        const i = sibs.indexOf(id)
        const j = i + dir
        if (j < 0 || j >= sibs.length) return d
        ;[sibs[i], sibs[j]] = [sibs[j], sibs[i]]
        return { ...d, tasks: reorder(d.tasks, t.parentId ?? null, sibs) }
      }),

    setPredecessors: (taskId, preds) =>
      get().apply((d) => {
        const keep = d.links.filter((l) => l.successorId !== taskId)
        const old = d.links.filter((l) => l.successorId === taskId)
        const next = preds
          .filter((p) => p.predecessorId !== taskId)
          .map((p) => ({ id: old.find((o) => o.predecessorId === p.predecessorId)?.id ?? newId(), successorId: taskId, ...p }))
        return { ...d, links: [...keep, ...next] }
      }),

    addLink: (link) =>
      get().apply((d) => {
        if (link.predecessorId === link.successorId) return d
        if (d.links.some((l) => l.predecessorId === link.predecessorId && l.successorId === link.successorId)) return d
        return { ...d, links: [...d.links, { id: newId(), ...link }] }
      }),
    updateLink: (id, patch) => get().apply((d) => ({ ...d, links: d.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    deleteLink: (id) => get().apply((d) => ({ ...d, links: d.links.filter((l) => l.id !== id) })),

    upsertResource: (r) =>
      get().apply((d) => ({
        ...d,
        resources: d.resources.some((x) => x.id === r.id) ? d.resources.map((x) => (x.id === r.id ? r : x)) : [...d.resources, r],
      })),
    deleteResource: (id) =>
      get().apply((d) => ({
        ...d,
        resources: d.resources.filter((r) => r.id !== id),
        assignments: d.assignments.filter((a) => a.resourceId !== id),
      })),
    setAssignments: (taskId, list) =>
      get().apply((d) => ({
        ...d,
        assignments: [...d.assignments.filter((a) => a.taskId !== taskId), ...list.map((a) => ({ ...a, taskId }))],
      })),

    addBaseline: (b) => get().apply((d) => ({ ...d, baselines: [...d.baselines, b] })),
    deleteBaseline: (id) => get().apply((d) => ({ ...d, baselines: d.baselines.filter((b) => b.id !== id) })),
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    const s = useProject.getState().saveState
    if (s === 'dirty' || s === 'saving') {
      void useProject.getState().flush()
      e.preventDefault()
    }
  })
}
