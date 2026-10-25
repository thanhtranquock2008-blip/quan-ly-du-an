import type { Task } from './types'

// Tiện ích cây hạng mục công việc (WBS).

export interface TreeIndex {
  byId: Map<string, Task>
  children: Map<string | null, Task[]>
  /** Thứ tự hiển thị (duyệt cây theo chiều sâu) */
  ordered: Task[]
  /** Mã WBS kiểu 1.3.1 */
  wbs: Map<string, string>
  level: Map<string, number>
  isSummary: (id: string) => boolean
  leavesOf: (id: string) => string[]
}

export function buildTree(tasks: Task[]): TreeIndex {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const children = new Map<string | null, Task[]>()
  for (const t of tasks) {
    const p = t.parentId && byId.has(t.parentId) ? t.parentId : null
    if (!children.has(p)) children.set(p, [])
    children.get(p)!.push(t)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)

  const ordered: Task[] = []
  const wbs = new Map<string, string>()
  const level = new Map<string, number>()
  const seen = new Set<string>()
  const walk = (parent: string | null, prefix: string, lv: number) => {
    const list = children.get(parent) ?? []
    list.forEach((t, i) => {
      if (seen.has(t.id)) return
      seen.add(t.id)
      const code = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      ordered.push(t)
      wbs.set(t.id, code)
      level.set(t.id, lv)
      walk(t.id, code, lv + 1)
    })
  }
  walk(null, '', 0)

  const isSummary = (id: string) => (children.get(id)?.length ?? 0) > 0
  const leafCache = new Map<string, string[]>()
  const leavesOf = (id: string): string[] => {
    const c = leafCache.get(id)
    if (c) return c
    const kids = children.get(id)
    const res = kids && kids.length ? kids.flatMap((k) => leavesOf(k.id)) : [id]
    leafCache.set(id, res)
    return res
  }
  return { byId, children, ordered, wbs, level, isSummary, leavesOf }
}

/** Tất cả hậu duệ (không gồm chính nó) */
export function descendantsOf(tree: TreeIndex, id: string): string[] {
  const out: string[] = []
  const stack = [...(tree.children.get(id) ?? [])]
  while (stack.length) {
    const t = stack.pop()!
    out.push(t.id)
    stack.push(...(tree.children.get(t.id) ?? []))
  }
  return out
}
