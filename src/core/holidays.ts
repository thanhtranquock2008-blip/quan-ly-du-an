import type { Holiday, WorkCalendar } from './types'

// Ngày nghỉ lễ Việt Nam (Bộ luật Lao động 2019, Điều 112).
// Ngày âm lịch (Tết, Giỗ Tổ) đã đổi sẵn sang dương lịch cho 2024-2030.
// Lịch nghỉ thực tế mỗi năm do Chính phủ công bố, người dùng nên kiểm tra và sửa lại.

const TET: Record<number, string> = {
  2024: '2024-02-10',
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-03',
}

const GIO_TO: Record<number, string> = {
  2024: '2024-04-18',
  2025: '2025-04-07',
  2026: '2026-04-26',
  2027: '2027-04-16',
  2028: '2028-04-04',
  2029: '2029-04-23',
  2030: '2030-04-12',
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function vietnamHolidays(year: number): Holiday[] {
  const list: Holiday[] = [
    { date: `${year}-01-01`, name: 'Tết Dương lịch' },
    { date: `${year}-04-30`, name: 'Ngày Chiến thắng' },
    { date: `${year}-05-01`, name: 'Quốc tế Lao động' },
    { date: `${year}-09-01`, name: 'Quốc khánh (ngày liền kề)' },
    { date: `${year}-09-02`, name: 'Quốc khánh' },
  ]
  const tet = TET[year]
  if (tet) {
    // nghỉ 5 ngày: 30 Tết đến mùng 4
    for (let i = -1; i <= 3; i++) list.push({ date: addDays(tet, i), name: i < 0 ? 'Tết Nguyên đán (30 Tết)' : `Tết Nguyên đán (mùng ${i + 1})` })
  }
  if (GIO_TO[year]) list.push({ date: GIO_TO[year], name: 'Giỗ Tổ Hùng Vương' })
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

export const SUPPORTED_HOLIDAY_YEARS = Object.keys(TET).map(Number)

/** Lịch công trường thường gặp: thứ Hai đến thứ Bảy, 7:30-11:30 và 13:30-17:30 */
export function defaultCalendar(years: number[] = []): WorkCalendar {
  return {
    workingWeekdays: [1, 2, 3, 4, 5, 6],
    intervals: [
      { from: '07:30', to: '11:30' },
      { from: '13:30', to: '17:30' },
    ],
    holidays: years.flatMap(vietnamHolidays),
  }
}
