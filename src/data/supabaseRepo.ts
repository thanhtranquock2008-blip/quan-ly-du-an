import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProjectData } from '../core/types'
import type { Member, MemberRole, ProjectSummary, Repo } from './repo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// Postgres trả số dạng chuỗi với numeric lớn; đưa về number
function normalize(data: ProjectData): ProjectData {
  const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v))
  return {
    ...data,
    tasks: data.tasks.map((t) => ({
      ...t,
      parentId: t.parentId ?? null,
      duration: Number(t.duration),
      percentComplete: Number(t.percentComplete ?? 0),
      quantity: n(t.quantity),
      fixedCost: n(t.fixedCost),
    })),
    links: data.links.map((l) => ({ ...l, lag: Number(l.lag) })),
    resources: data.resources.map((r) => ({ ...r, rate: Number(r.rate), costPerUse: Number(r.costPerUse) })),
    assignments: data.assignments.map((a) => ({ ...a, units: Number(a.units) })),
    project: { ...data.project, budget: n(data.project.budget) },
  }
}

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const
  private readonly db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async listProjects() {
    return check(await this.db.rpc('list_projects')) as ProjectSummary[]
  }

  async loadProject(id: string) {
    return normalize(check(await this.db.rpc('get_project', { pid: id })) as ProjectData)
  }

  async saveProject(data: ProjectData) {
    check(await this.db.rpc('save_project', { payload: data }))
  }

  async deleteProject(id: string) {
    check(await this.db.from('projects').delete().eq('id', id))
  }

  async listMembers(projectId: string): Promise<Member[]> {
    const rows = check(await this.db.rpc('list_members', { pid: projectId })) as { user_id: string; email: string; role: MemberRole }[]
    return rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role }))
  }

  async addMember(projectId: string, email: string, role: MemberRole) {
    check(await this.db.rpc('add_member', { pid: projectId, member_email: email, member_role: role }))
  }

  async updateProgress(taskId: string, percent: number, actualStart?: string, actualFinish?: string) {
    check(await this.db.rpc('update_task_progress', { tid: taskId, pct: percent, a_start: actualStart ?? null, a_finish: actualFinish ?? null }))
  }

  async removeMember(projectId: string, userId: string) {
    check(await this.db.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId))
  }
}
