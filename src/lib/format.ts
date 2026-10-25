import dayjs from 'dayjs'

export const DATE_FMT = 'DD/MM/YYYY'
export const DATETIME_FMT = 'DD/MM/YYYY HH:mm'

export function fmtDate(s?: string): string {
  return s ? dayjs(s).format(DATE_FMT) : ''
}

export function fmtDateTime(s?: string): string {
  return s ? dayjs(s).format(DATETIME_FMT) : ''
}

export function fmtDays(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return ''
  return `${Math.round(n * 100) / 100} ngày`.replace('.', ',')
}

export function fmtNum(n?: number, digits = 2): string {
  if (n === undefined || n === null || isNaN(n)) return ''
  return n.toLocaleString('vi-VN', { maximumFractionDigits: digits })
}

export function fmtVnd(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return ''
  return Math.round(n).toLocaleString('vi-VN')
}

export function downloadText(name: string, text: string, type = 'application/json') {
  downloadBlob(name, new Blob([text], { type }))
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(a.href)
  }, 2000)
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'du-an'
}
