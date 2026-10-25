import ExcelJS from 'exceljs'
import { resourceLabel } from '../core/cost'
import { formatPredecessors } from '../core/predecessors'
import type { Derived } from '../store/useSchedule'
import { downloadBlob, fmtDate, safeFileName } from './format'

// Xuất tiến độ ra Excel để nộp hồ sơ, gửi chủ đầu tư (TD-06).

const r2 = (x: number) => Math.round(x * 100) / 100
const MONEY = '#,##0'

export async function exportExcel({ data, sched, costs, rowOf }: Derived) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Quản lý tiến độ thi công'
  const p = data.project
  const level = sched.tree.level

  const head = (ws: ExcelJS.Worksheet, title: string, cols: number) => {
    ws.mergeCells(1, 1, 1, cols)
    ws.getCell(1, 1).value = title
    ws.getCell(1, 1).font = { bold: true, size: 14 }
    ws.mergeCells(2, 1, 2, cols)
    ws.getCell(2, 1).value = `Dự án: ${p.name}${p.code ? ` (${p.code})` : ''} · Khởi công ${fmtDate(sched.projectStart)} · Hoàn thành ${fmtDate(sched.projectFinish)} · ${sched.projectDuration} ngày làm việc`
    ws.addRow([])
  }
  const styleHeader = (row: ExcelJS.Row) => {
    row.font = { bold: true }
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F2' } }
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })
  }

  // Bảng tiến độ
  const ws = wb.addWorksheet('Tiến độ', { views: [{ state: 'frozen', ySplit: 4 }] })
  head(ws, 'BẢNG TIẾN ĐỘ THI CÔNG', 11)
  styleHeader(ws.addRow(['STT', 'WBS', 'Hạng mục công việc', 'Thời gian (ngày)', 'Bắt đầu', 'Kết thúc', 'Việc trước', 'Nhân công - Vật tư - Máy', 'Chi phí (₫)', '% hoàn thành', 'Găng']))
  for (const t of sched.tree.ordered) {
    const s = sched.tasks.get(t.id)!
    const row = ws.addRow([
      rowOf.get(t.id), s.wbs, `${'   '.repeat(level.get(t.id) ?? 0)}${t.name}`, r2(s.isSummary ? s.duration : t.duration),
      fmtDate(s.start), fmtDate(s.finish), formatPredecessors(t.id, data.links, rowOf),
      s.isSummary ? '' : resourceLabel(t.id, data.resources, data.assignments), costs.byTask.get(t.id) ?? 0,
      Math.round(s.percentComplete) / 100, s.critical && !s.isSummary ? 'Găng' : '',
    ])
    if (s.isSummary) row.font = { bold: true }
    if (s.critical && !s.isSummary) row.getCell(11).font = { color: { argb: 'FFC4373C' }, bold: true }
  }
  const tot = ws.addRow(['', '', 'TỔNG CỘNG', '', '', '', '', '', costs.total])
  tot.font = { bold: true }
  ws.getColumn(9).numFmt = MONEY
  ws.getColumn(10).numFmt = '0%'
  ;[6, 10, 48, 10, 12, 12, 14, 48, 16, 11, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w))

  // Bảng CPM
  const wc = wb.addWorksheet('Thông số CPM', { views: [{ state: 'frozen', ySplit: 4 }] })
  head(wc, 'THÔNG SỐ SƠ ĐỒ MẠNG (CPM)', 11)
  styleHeader(wc.addRow(['STT', 'WBS', 'Công việc', 'D', 'ES', 'EF', 'LS', 'LF', 'TF', 'FF', 'Găng']))
  for (const t of sched.tree.ordered) {
    const s = sched.tasks.get(t.id)!
    if (s.isSummary) continue
    wc.addRow([rowOf.get(t.id), s.wbs, t.name, r2(t.duration), r2(s.es), r2(s.ef), r2(s.ls), r2(s.lf), r2(s.tf), r2(s.ff), s.critical ? 'Găng' : ''])
  }
  ;[6, 10, 48, 8, 8, 8, 8, 8, 8, 8, 8].forEach((w, i) => (wc.getColumn(i + 1).width = w))

  // Nguồn lực
  const wr = wb.addWorksheet('Nguồn lực')
  head(wr, 'DANH MỤC NGUỒN LỰC', 6)
  styleHeader(wr.addRow(['Tên', 'Loại', 'Đơn vị', 'Đơn giá (₫)', 'Phí mỗi lần dùng (₫)', 'Tổ đội / nhóm']))
  const typeName = { work: 'Nhân công / máy', material: 'Vật tư', cost: 'Chi phí' }
  for (const r of data.resources) wr.addRow([r.name, r.isEquipment ? 'Máy thi công' : typeName[r.type], r.unit ?? '', r.rate, r.costPerUse, r.group ?? ''])
  wr.getColumn(4).numFmt = MONEY
  wr.getColumn(5).numFmt = MONEY
  ;[32, 16, 10, 16, 18, 18].forEach((w, i) => (wr.getColumn(i + 1).width = w))

  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(`${safeFileName(p.name)}-tien-do.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
