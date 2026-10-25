import type { WorkCalendar } from './types'

// Lịch làm việc: quy đổi giữa thời điểm (chuỗi "YYYY-MM-DDTHH:mm") và
// "phút làm việc" tính từ một mốc gốc. Mọi phép tính tiến độ chạy trên trục
// phút làm việc, chỉ đổi ra ngày giờ khi hiển thị.

const DAY_MS = 86_400_000

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Số thứ tự ngày (kể từ 1970-01-01) của chuỗi "YYYY-MM-DD..." */
export function dayNumber(s: string): number {
  const y = Number(s.slice(0, 4))
  const mo = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  return Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS)
}

export function dayToDate(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

/** Phút trong ngày của chuỗi "YYYY-MM-DDTHH:mm" (0 nếu không có giờ) */
export function minuteOfDay(s: string): number {
  return s.length >= 16 ? parseTime(s.slice(11, 16)) : 0
}

export function joinDateTime(day: number, minute: number): string {
  return `${dayToDate(day)}T${formatTime(minute)}`
}

export function weekday(day: number): number {
  // 1970-01-01 là thứ Năm (4)
  return (((day + 4) % 7) + 7) % 7
}

export function minutesPerDay(cal: WorkCalendar): number {
  return cal.intervals.reduce((s, iv) => s + parseTime(iv.to) - parseTime(iv.from), 0)
}

export class CalendarIndex {
  readonly cal: WorkCalendar
  readonly originDay: number
  readonly mpd: number
  private readonly intervals: [number, number][]
  private readonly holidays: Set<number>
  private readonly extra: Set<number>
  /** cum[i] = phút làm việc từ đầu ngày originDay + lo + i đến đầu ngày đó */
  private cum: number[] = [0]
  private lo = 0 // chỉ số ngày (tương đối) của cum[0]

  constructor(cal: WorkCalendar, originDate: string) {
    this.cal = cal
    this.originDay = dayNumber(originDate)
    this.intervals = cal.intervals
      .map((iv) => [parseTime(iv.from), parseTime(iv.to)] as [number, number])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0])
    this.mpd = this.intervals.reduce((s, [a, b]) => s + b - a, 0)
    if (this.mpd <= 0) throw new Error('Lịch làm việc phải có ít nhất một ca làm việc')
    if (cal.workingWeekdays.length === 0 && !(cal.extraWorkingDays?.length))
      throw new Error('Lịch làm việc phải có ít nhất một ngày làm việc trong tuần')
    this.holidays = new Set(cal.holidays.map((h) => dayNumber(h.date)))
    this.extra = new Set((cal.extraWorkingDays ?? []).map(dayNumber))
  }

  isWorkingDay(day: number): boolean {
    if (this.extra.has(day)) return true
    if (this.holidays.has(day)) return false
    return this.cal.workingWeekdays.includes(weekday(day))
  }

  private dayMinutes(day: number): number {
    return this.isWorkingDay(day) ? this.mpd : 0
  }

  /** Phút làm việc đã qua trong ngày tính đến phút m của ngày */
  private workedWithin(day: number, m: number): number {
    if (!this.isWorkingDay(day)) return 0
    let w = 0
    for (const [a, b] of this.intervals) {
      if (m <= a) break
      w += Math.min(m, b) - a
    }
    return w
  }

  /** Phút trong ngày tại đó đã làm được w phút. atEnd: dừng ở cuối ca thay vì đầu ca sau. */
  private minuteForWorked(w: number, atEnd: boolean): number {
    let acc = 0
    for (const [a, b] of this.intervals) {
      const len = b - a
      if (atEnd ? w <= acc + len : w < acc + len) return a + (w - acc)
      acc += len
    }
    return this.intervals[this.intervals.length - 1][1]
  }

  private ensure(rel: number) {
    while (rel < this.lo) {
      this.lo -= 1
      this.cum.unshift(this.cum[0] - this.dayMinutes(this.originDay + this.lo))
    }
    while (rel > this.lo + this.cum.length - 1) {
      const last = this.lo + this.cum.length - 1
      this.cum.push(this.cum[this.cum.length - 1] + this.dayMinutes(this.originDay + last))
    }
  }

  /** Phút làm việc từ 00:00 ngày gốc đến đầu ngày `day` */
  private cumDay(day: number): number {
    const rel = day - this.originDay
    this.ensure(rel)
    return this.cum[rel - this.lo]
  }

  /** Vị trí (phút làm việc, tính từ 00:00 ngày gốc) của một thời điểm */
  toMinutes(dt: string): number {
    const day = dayNumber(dt)
    return this.cumDay(day) + this.workedWithin(day, minuteOfDay(dt))
  }

  /**
   * Thời điểm ứng với vị trí phút làm việc.
   * mode 'start': nếu rơi đúng cuối ca/cuối ngày thì nhảy sang đầu ca làm việc kế tiếp.
   * mode 'finish': dừng ở cuối ca/cuối ngày làm việc.
   */
  toDate(pos: number, mode: 'start' | 'finish'): string {
    // ước lượng ngày rồi dò tới đúng ngày
    const daysPerWeek = Math.max(1, this.cal.workingWeekdays.length)
    let day = this.originDay + Math.floor((pos / this.mpd) * (7 / daysPerWeek))
    const guard = 100_000
    for (let i = 0; i < guard; i++) {
      const c = this.cumDay(day)
      const m = this.dayMinutes(day)
      const inside =
        mode === 'start' ? pos >= c && pos < c + m : pos > c && pos <= c + m
      if (m > 0 && inside) {
        return joinDateTime(day, this.minuteForWorked(pos - c, mode === 'finish'))
      }
      if (mode === 'start' ? pos < c : pos <= c) day -= 1
      else day += 1
    }
    throw new Error('Không quy đổi được ngày theo lịch làm việc')
  }

  /** Cộng thêm số ngày làm việc vào một thời điểm */
  addWorkingDays(dt: string, days: number, mode: 'start' | 'finish' = 'finish'): string {
    return this.toDate(this.toMinutes(dt) + days * this.mpd, mode)
  }

  /** Đưa thời điểm về đầu ca làm việc gần nhất phía sau (nếu đang ngoài giờ) */
  normalizeStart(dt: string): string {
    return this.toDate(this.toMinutes(dt), 'start')
  }
}
