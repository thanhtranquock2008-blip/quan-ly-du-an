import { describe, expect, it, vi } from 'vitest'
import { newId } from '../id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('Mã định danh', () => {
  it('là UUID v4 kể cả khi không có crypto.randomUUID (mở qua http trong mạng LAN)', () => {
    vi.stubGlobal('isSecureContext', false)
    const ids = new Set(Array.from({ length: 1000 }, newId))
    vi.unstubAllGlobals()
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(UUID)
  })
  it('dùng crypto.randomUUID khi có', () => {
    expect(newId()).toMatch(UUID)
  })
})
