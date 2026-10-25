import type { Link, LinkType } from './types'

// Nhập/hiển thị cột "Việc trước" theo kiểu MS Project: "2, 3SS+2, 5FF-1"
// Số là STT dòng (thứ tự hiển thị, bắt đầu từ 1).

export interface ParsedPred {
  row: number
  type: LinkType
  lag: number
}

export function parsePredecessors(text: string): ParsedPred[] {
  const out: ParsedPred[] = []
  for (const raw of text.split(/[,;]/)) {
    const s = raw.trim().toUpperCase().replace(/\s+/g, '')
    if (!s) continue
    const m = /^(\d+)(FS|SS|FF|SF|KB|BB|KK|BK)?([+-]\d+(?:[.,]\d+)?)?(?:D|NGÀY|NGAY)?$/.exec(s)
    if (!m) throw new Error(`Không hiểu "${raw.trim()}". Ví dụ đúng: 2, 3SS+2, 5FF-1`)
    // cho phép viết tắt tiếng Việt: KB = kết thúc-bắt đầu ...
    const vi: Record<string, LinkType> = { KB: 'FS', BB: 'SS', KK: 'FF', BK: 'SF' }
    const type = (m[2] ? vi[m[2]] ?? m[2] : 'FS') as LinkType
    out.push({ row: Number(m[1]), type, lag: m[3] ? Number(m[3].replace(',', '.')) : 0 })
  }
  return out
}

export function formatPredecessors(taskId: string, links: Link[], rowOf: Map<string, number>): string {
  return links
    .filter((l) => l.successorId === taskId && rowOf.has(l.predecessorId))
    .sort((a, b) => rowOf.get(a.predecessorId)! - rowOf.get(b.predecessorId)!)
    .map((l) => {
      const lag = l.lag ? (l.lag > 0 ? `+${l.lag}` : `${l.lag}`) : ''
      const type = l.type === 'FS' && !lag ? '' : l.type
      return `${rowOf.get(l.predecessorId)}${type}${lag}`
    })
    .join(', ')
}

export const LINK_LABEL: Record<LinkType, string> = {
  FS: 'Kết thúc → Bắt đầu (FS)',
  SS: 'Bắt đầu → Bắt đầu (SS)',
  FF: 'Kết thúc → Kết thúc (FF)',
  SF: 'Bắt đầu → Kết thúc (SF)',
}
