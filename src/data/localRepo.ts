import type { ProjectData } from '../core/types'
import type { ProjectSummary, Repo } from './repo'

const INDEX_KEY = 'qlda:projects'
const projectKey = (id: string) => `qlda:project:${id}`

function readIndex(): ProjectSummary[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]')
  } catch {
    return []
  }
}

export class LocalRepo implements Repo {
  readonly kind = 'local' as const

  async listProjects() {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async loadProject(id: string): Promise<ProjectData> {
    const raw = localStorage.getItem(projectKey(id))
    if (!raw) throw new Error('Không tìm thấy dự án')
    const data = JSON.parse(raw) as ProjectData
    data.baselines ??= []
    return data
  }

  async saveProject(data: ProjectData) {
    try {
      localStorage.setItem(projectKey(data.project.id), JSON.stringify(data))
    } catch {
      throw new Error('Bộ nhớ trình duyệt đã đầy. Hãy xuất sao lưu và xóa bớt dự án cũ, hoặc dùng chế độ trực tuyến (Supabase).')
    }
    const idx = readIndex().filter((p) => p.id !== data.project.id)
    idx.push(data.project)
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx))
  }

  async deleteProject(id: string) {
    localStorage.removeItem(projectKey(id))
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((p) => p.id !== id)))
  }
}
