import { newId, nowIso } from '../core/id'
import type { ProjectData } from '../core/types'

/** Tạo bản sao dự án với mã mới cho mọi bản ghi (nhân bản, khôi phục sao lưu) */
export function cloneWithNewIds(d: ProjectData, name?: string): ProjectData {
  const map = new Map<string, string>()
  const id = (old: string) => {
    if (!map.has(old)) map.set(old, newId())
    return map.get(old)!
  }
  const now = nowIso()
  return {
    project: { ...d.project, id: newId(), name: name ?? d.project.name, createdAt: now, updatedAt: now },
    tasks: d.tasks.map((t) => ({ ...t, id: id(t.id), parentId: t.parentId ? id(t.parentId) : null })),
    links: d.links.map((l) => ({ ...l, id: newId(), predecessorId: id(l.predecessorId), successorId: id(l.successorId) })),
    resources: d.resources.map((r) => ({ ...r, id: id(r.id) })),
    assignments: d.assignments.map((a) => ({ ...a, id: newId(), taskId: id(a.taskId), resourceId: id(a.resourceId) })),
    baselines: (d.baselines ?? []).map((b) => ({ ...b, id: newId(), entries: b.entries.map((e) => ({ ...e, taskId: id(e.taskId) })) })),
  }
}

export function validateBackup(x: unknown): ProjectData {
  const d = x as ProjectData
  if (!d || typeof d !== 'object' || !d.project || !Array.isArray(d.tasks) || !Array.isArray(d.links))
    throw new Error('Tệp sao lưu không đúng định dạng')
  return { ...d, resources: d.resources ?? [], assignments: d.assignments ?? [], baselines: d.baselines ?? [] }
}
