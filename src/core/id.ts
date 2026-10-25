// crypto.randomUUID chỉ có khi trang chạy qua HTTPS hoặc localhost. Khi mở qua mạng LAN
// bằng http://192.168.x.x thì tự tạo UUID v4 từ crypto.getRandomValues (luôn có sẵn).
export function newId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function' && (typeof isSecureContext === 'undefined' || isSecureContext)) return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
