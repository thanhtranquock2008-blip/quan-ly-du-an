import type { Project, ProjectData } from '../core/types'

// Lớp lưu trữ: chạy trên trình duyệt (localStorage) hoặc Supabase khi đã cấu hình.

export type MemberRole = 'quan_tri' | 'chu_dau_tu' | 'chu_nhiem' | 'tu_van' | 'nha_thau'

export const ROLE_LABEL: Record<MemberRole, string> = {
  quan_tri: 'Quản trị',
  chu_dau_tu: 'Chủ đầu tư / Giám đốc',
  chu_nhiem: 'Chủ nhiệm dự án / Ban QLDA',
  tu_van: 'Tư vấn thiết kế, giám sát',
  nha_thau: 'Nhà thầu / Tổ trưởng',
}

export interface Member {
  userId: string
  email: string
  role: MemberRole
}

export interface ProjectSummary extends Project {
  /** Vai trò của người đang đăng nhập trong dự án (chế độ trực tuyến) */
  myRole?: MemberRole
}

export interface Repo {
  readonly kind: 'local' | 'supabase'
  listProjects(): Promise<ProjectSummary[]>
  loadProject(id: string): Promise<ProjectData>
  saveProject(data: ProjectData): Promise<void>
  deleteProject(id: string): Promise<void>
  listMembers?(projectId: string): Promise<Member[]>
  addMember?(projectId: string, email: string, role: MemberRole): Promise<void>
  removeMember?(projectId: string, userId: string): Promise<void>
  /** Cập nhật riêng tiến độ một công việc (dành cho nhà thầu, không cần quyền sửa dự án) */
  updateProgress?(taskId: string, percent: number, actualStart?: string, actualFinish?: string): Promise<void>
}
