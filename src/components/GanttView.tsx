import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined, LinkOutlined, MenuFoldOutlined,
  MenuUnfoldOutlined, PlusOutlined, SubnodeOutlined,
} from '@ant-design/icons'
import { App, Button, Checkbox, Divider, InputNumber, Modal, Popconfirm, Radio, Select, Space, Tooltip } from 'antd'
import { escapeHTML, gantt, type Task as GTask } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { useEffect, useRef, useState } from 'react'
import { CalendarIndex, dayNumber } from '../core/calendar'
import { resourceLabel } from '../core/cost'
import { CycleError } from '../core/cpm'
import { formatPredecessors, LINK_LABEL, parsePredecessors } from '../core/predecessors'
import type { Link, LinkType, WorkCalendar } from '../core/types'
import { fmtDate } from '../lib/format'
import { useProject } from '../store/projectStore'
import { useDerived, type Derived } from '../store/useSchedule'
import TaskDrawer from './TaskDrawer'

// Biểu đồ Gantt dùng DHTMLX Gantt (bản MIT) chỉ để hiển thị và thao tác;
// mọi phép tính ngày do bộ CPM của chương trình thực hiện.

const TO_G: Record<LinkType, string> = { FS: '0', SS: '1', FF: '2', SF: '3' }
const FROM_G: Record<string, LinkType> = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' }
type Zoom = 'day' | 'week' | 'month'

const toG = (s: string) => s.replace('T', ' ')
const pad = (n: number) => String(n).padStart(2, '0')
const fromDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

function setZoom(z: Zoom) {
  if (z === 'day') {
    gantt.config.scales = [
      { unit: 'month', step: 1, format: 'Tháng %m/%Y' },
      { unit: 'day', step: 1, format: '%d' },
    ]
    gantt.config.min_column_width = 26
  } else if (z === 'week') {
    gantt.config.scales = [
      { unit: 'month', step: 1, format: 'Tháng %m/%Y' },
      { unit: 'week', step: 1, format: (d: Date) => `Tuần ${gantt.date.date_to_str('%d/%m')(d)}` },
    ]
    gantt.config.min_column_width = 70
  } else {
    gantt.config.scales = [
      { unit: 'year', step: 1, format: 'Năm %Y' },
      { unit: 'month', step: 1, format: 'T%m' },
    ]
    gantt.config.min_column_width = 50
  }
}

export default function GanttView() {
  const host = useRef<HTMLDivElement>(null)
  const derived = useDerived()!
  const readOnly = useProject((s) => s.readOnly)
  const { message } = App.useApp()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editLink, setEditLink] = useState<Link | null>(null)
  const [zoom, setZoomState] = useState<Zoom>('day')
  const [showCritical, setShowCritical] = useState(true)
  const [showBaseline, setShowBaseline] = useState(false)
  const [showResources, setShowResources] = useState(true)
  const closed = useRef(new Set<string>())
  const calCache = useRef<{ cal: WorkCalendar; idx: CalendarIndex; hol: Set<string> } | null>(null)
  const latest = useRef<Derived>(derived)
  latest.current = derived
  const opts = useRef({ showCritical, showBaseline, showResources })
  opts.current = { showCritical, showBaseline, showResources }

  const act = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      if (e instanceof CycleError) message.error(e.message)
      else message.error((e as Error).message)
    }
  }

  // Khởi tạo một lần
  useEffect(() => {
    const el = host.current!
    try {
      gantt.i18n.setLocale('vi')
    } catch {
      /* bản không có tiếng Việt */
    }
    gantt.plugins({ marker: true, tooltip: true })
    gantt.config.date_format = '%Y-%m-%d %H:%i'
    gantt.config.duration_unit = 'hour'
    gantt.config.round_dnd_dates = false
    gantt.config.time_step = 30
    gantt.config.details_on_dblclick = false
    gantt.config.show_errors = false
    gantt.config.open_tree_initially = true
    gantt.config.row_height = 30
    gantt.config.bar_height = 18
    gantt.config.grid_width = 700
    gantt.config.grid_resize = true
    gantt.config.keyboard_navigation_cells = true
    gantt.config.auto_types = false
    gantt.config.order_branch = false
    gantt.config.sort = false
    gantt.config.columns = [
      { name: 'row', label: 'STT', width: 40, align: 'center', template: (t: GTask) => String(t.row) },
      { name: 'wbs', label: 'WBS', width: 55, template: (t: GTask) => String(t.wbs) },
      { name: 'text', label: 'Công việc', tree: true, width: 220, resize: true, editor: { type: 'text', map_to: 'text' } },
      { name: 'dur', label: 'T.gian', width: 55, align: 'right', template: (t: GTask) => String(t.durText), editor: { type: 'number', map_to: 'dur', min: 0 } },
      { name: 'start', label: 'Bắt đầu', width: 94, align: 'center', template: (t: GTask) => fmtDate(t.startIso), editor: { type: 'date', map_to: 'start_date' } },
      { name: 'end', label: 'Kết thúc', width: 94, align: 'center', template: (t: GTask) => fmtDate(t.finishIso) },
      { name: 'pred', label: 'Việc trước', width: 80, template: (t: GTask) => escapeHTML(String(t.pred ?? '')), editor: { type: 'text', map_to: 'pred' } },
      { name: 'tf', label: 'Dự trữ', width: 50, align: 'right', template: (t: GTask) => (t.type === 'project' ? '' : String(t.tf)) },
    ]
    setZoom('day')

    gantt.templates.task_class = (_s, _e, t) => {
      const c: string[] = []
      if (opts.current.showCritical && t.critical && t.type !== 'project') c.push('critical')
      if (t.complete) c.push('done')
      return c.join(' ')
    }
    gantt.templates.grid_row_class = (_s, _e, t) => (t.type === 'project' ? 'summary-row' : t.critical ? 'critical-row' : '')
    gantt.templates.task_text = () => ''
    gantt.templates.rightside_text = (_s, _e, t) => (opts.current.showResources && t.res ? escapeHTML(String(t.res)) : t.type === 'milestone' ? escapeHTML(String(t.text)) : '')
    gantt.templates.tooltip_text = (_s, _e, t) => {
      const lines = [
        `<b>${escapeHTML(String(t.wbs))} ${escapeHTML(String(t.text))}</b>`,
        `Bắt đầu: ${fmtDate(String(t.startIso))} · Kết thúc: ${fmtDate(String(t.finishIso))}`,
        `Thời gian: ${t.durText} ngày · Dự trữ toàn phần: ${t.tf} ngày${t.critical ? ' · <b style="color:#c4373c">Găng</b>' : ''}`,
        `Hoàn thành: ${Math.round(Number(t.progress) * 100)}%`,
      ]
      if (t.res) lines.push(escapeHTML(String(t.res)))
      return lines.join('<br/>')
    }
    gantt.templates.timeline_cell_class = (_t, date) => {
      const cal = latest.current.data.project.calendar
      if (!gantt.getState().scale_unit || gantt.getState().scale_unit !== 'day') return ''
      const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      if (calCache.current?.cal !== cal) calCache.current = { cal, idx: new CalendarIndex(cal, iso), hol: new Set(cal.holidays.map((h) => h.date)) }
      if (iso === latest.current.data.project.statusDate) return 'gantt-status-cell'
      if (calCache.current.hol.has(iso)) return 'gantt-holiday'
      return calCache.current.idx.isWorkingDay(dayNumber(iso)) ? '' : 'gantt-weekend'
    }

    // lớp hiển thị kế hoạch gốc dưới thanh công việc
    try {
      gantt.addTaskLayer((t: GTask) => {
        if (!opts.current.showBaseline || !t.blStart || !t.blEnd) return false
        const sizes = gantt.getTaskPosition(t, gantt.date.parseDate(String(t.blStart), 'xml_date'), gantt.date.parseDate(String(t.blEnd), 'xml_date'))
        const el = document.createElement('div')
        el.style.cssText = `position:absolute;left:${sizes.left}px;width:${Math.max(sizes.width, 3)}px;top:${sizes.top + gantt.config.row_height - 8}px;height:5px;background:#9ca3af;border-radius:2px;`
        el.title = `Kế hoạch gốc: ${fmtDate(String(t.blStart))} → ${fmtDate(String(t.blEnd))}`
        return el
      })
    } catch {
      /* phiên bản không hỗ trợ lớp phụ */
    }

    const ev: string[] = []
    const on = (name: string, fn: (...a: never[]) => unknown) => ev.push(gantt.attachEvent(name as never, fn as never))
    on('onTaskSelected', (id: string) => setSelected(String(id)))
    on('onTaskClick', (id: string) => {
      if (id && gantt.isTaskExists(id)) setSelected(String(id))
      return true
    })
    on('onTaskClosed', (id: string) => closed.current.add(String(id)))
    on('onTaskOpened', (id: string) => closed.current.delete(String(id)))
    on('onTaskDblClick', (id: string, e: MouseEvent) => {
      if (id && !(e.target as HTMLElement).closest('.gantt_grid_data')) setEditing(String(id))
      return false
    })
    on('onBeforeLightbox', () => false)
    on('onBeforeTaskDrag', (id: string) => !useProject.getState().readOnly && gantt.getTask(id).type !== 'project')
    on('onAfterTaskDrag', (id: string, mode: string) => {
      const t = gantt.getTask(id)
      const st = useProject.getState()
      const cal = new CalendarIndex(latest.current.data.project.calendar, latest.current.data.project.start)
      act(() => {
        if (mode === 'progress') st.updateTask(String(id), { percentComplete: Math.round((t.progress ?? 0) * 100) })
        else if (mode === 'move') {
          const start = cal.normalizeStart(fromDate(t.start_date!))
          st.updateTask(String(id), { constraint: 'SNET', constraintDate: start })
          message.info(`Đã đặt ràng buộc "Bắt đầu không sớm hơn ${fmtDate(start)}"`)
        } else if (mode === 'resize') {
          const d = (cal.toMinutes(fromDate(t.end_date!)) - cal.toMinutes(fromDate(t.start_date!))) / cal.mpd
          st.updateTask(String(id), { duration: Math.max(0, Math.round(d * 2) / 2) })
        }
      })
      render()
    })
    on('onBeforeLinkAdd', (_id: string, l: { source: string; target: string; type: string }) => {
      act(() => useProject.getState().addLink({ predecessorId: String(l.source), successorId: String(l.target), type: FROM_G[l.type] ?? 'FS', lag: 0 }))
      return false
    })
    on('onLinkDblClick', (id: string) => {
      const l = latest.current.data.links.find((x) => x.id === String(id))
      if (l) setEditLink(l)
      return false
    })
    const ie = gantt.ext.inlineEditors
    const ieId = ie.attachEvent('onBeforeSave', (s: { id: string | number; columnName: string; newValue: unknown; oldValue: unknown }) => {
      const st = useProject.getState()
      const id = String(s.id)
      act(() => {
        if (s.columnName === 'text') st.updateTask(id, { name: String(s.newValue) })
        if (s.columnName === 'dur') st.updateTask(id, { duration: Math.max(0, Number(s.newValue) || 0) })
        if (s.columnName === 'start') {
          const cal = new CalendarIndex(latest.current.data.project.calendar, latest.current.data.project.start)
          const d = s.newValue as Date
          const iso = cal.normalizeStart(`${fromDate(d).slice(0, 10)}T00:00`)
          st.updateTask(id, { constraint: 'SNET', constraintDate: iso })
        }
        if (s.columnName === 'pred') {
          const rows = latest.current.sched.tree.ordered
          const preds = parsePredecessors(String(s.newValue ?? '')).map((p) => {
            const t = rows[p.row - 1]
            if (!t) throw new Error(`Không có dòng số ${p.row}`)
            return { predecessorId: t.id, type: p.type, lag: p.lag }
          })
          st.setPredecessors(id, preds)
        }
      })
      setTimeout(render)
      return false
    })
    ;(ie as unknown as { attachEvent: (n: string, f: (s: { id: string; columnName: string }) => boolean) => string }).attachEvent('onBeforeEditStart', (s) => {
      if (useProject.getState().readOnly) return false
      const t = gantt.getTask(s.id)
      return !(t.type === 'project' && (s.columnName === 'dur' || s.columnName === 'start'))
    })

    gantt.init(el)
    render()
    return () => {
      ev.forEach((id) => gantt.detachEvent(id))
      ie.detachEvent(ieId)
      gantt.clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function render() {
    const { data, sched, rowOf } = latest.current
    const bl = data.baselines[data.baselines.length - 1]
    const blMap = new Map(bl?.entries.map((e) => [e.taskId, e]))
    const state = gantt.getScrollState()
    const sel = gantt.getSelectedId()
    gantt.config.readonly = useProject.getState().readOnly
    gantt.clearAll()
    const tasks = sched.tree.ordered.map((t) => {
      const s = sched.tasks.get(t.id)!
      const b = blMap.get(t.id)
      return {
        id: t.id,
        parent: t.parentId ?? 0,
        text: t.name,
        start_date: toG(s.start),
        end_date: toG(s.isMilestone ? s.start : s.finish),
        type: s.isSummary ? 'project' : s.isMilestone ? 'milestone' : 'task',
        progress: s.percentComplete / 100,
        open: !closed.current.has(t.id),
        row: rowOf.get(t.id),
        wbs: s.wbs,
        dur: t.duration,
        durText: Math.round((s.isSummary ? s.duration : t.duration) * 100) / 100,
        startIso: s.start,
        finishIso: s.finish,
        pred: formatPredecessors(t.id, data.links, rowOf),
        tf: s.tf,
        critical: s.critical,
        complete: s.complete,
        res: s.isSummary ? '' : resourceLabel(t.id, data.resources, data.assignments),
        blStart: b ? toG(b.start) : undefined,
        blEnd: b ? toG(b.finish) : undefined,
      }
    })
    const links = data.links.map((l) => ({ id: l.id, source: l.predecessorId, target: l.successorId, type: TO_G[l.type], lag: l.lag }))
    gantt.parse({ data: tasks, links })
    if (typeof gantt.addMarker === 'function') {
      gantt.deleteMarker('status')
      gantt.deleteMarker('today')
      gantt.addMarker({ id: 'today', start_date: new Date(), css: 'today', text: 'Hôm nay', title: 'Hôm nay' })
      if (data.project.statusDate)
        gantt.addMarker({ id: 'status', start_date: gantt.date.parseDate(`${data.project.statusDate} 23:59`, 'xml_date'), css: 'gantt-status-line', text: 'Cập nhật', title: `Ngày cập nhật ${fmtDate(data.project.statusDate)}` })
    }
    if (sel && gantt.isTaskExists(sel)) gantt.selectTask(sel)
    gantt.scrollTo(state.x, state.y)
  }

  useEffect(() => {
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, showCritical, showBaseline, showResources, readOnly])

  useEffect(() => {
    setZoom(zoom)
    gantt.render()
  }, [zoom])

  const st = useProject.getState()
  const sel = selected && derived.sched.tasks.has(selected) ? selected : null
  const add = (asChild: boolean) => act(() => {
    const id = st.addTask(sel, asChild)
    setSelected(id)
    setTimeout(() => gantt.isTaskExists(id) && gantt.showTask(id))
  })
  const linkChain = () => {
    // nối tuần tự các việc đang chọn (bấm Ctrl để chọn nhiều)
    const ids = (gantt.getSelectedTasks?.() ?? []).map(String)
    if (ids.length < 2) {
      message.info('Giữ Ctrl và bấm chọn từ hai công việc trở lên để nối tuần tự (FS)')
      return
    }
    const order = derived.rowOf
    ids.sort((a, b) => order.get(a)! - order.get(b)!)
    act(() => {
      for (let i = 1; i < ids.length; i++) st.addLink({ predecessorId: ids[i - 1], successorId: ids[i], type: 'FS', lag: 0 })
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar no-print">
        {!readOnly && (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => add(false)}>Thêm việc</Button>
            <Tooltip title="Thêm việc con của dòng đang chọn"><Button icon={<SubnodeOutlined />} disabled={!sel} onClick={() => add(true)}>Việc con</Button></Tooltip>
            <Tooltip title="Sửa chi tiết (hoặc bấm đúp vào thanh Gantt)"><Button icon={<EditOutlined />} disabled={!sel} onClick={() => setEditing(sel)} /></Tooltip>
            <Tooltip title="Thụt vào (thành việc con của dòng trên)"><Button icon={<MenuUnfoldOutlined />} disabled={!sel} onClick={() => act(() => st.indent(sel!))} /></Tooltip>
            <Tooltip title="Thụt ra"><Button icon={<MenuFoldOutlined />} disabled={!sel} onClick={() => act(() => st.outdent(sel!))} /></Tooltip>
            <Tooltip title="Lên"><Button icon={<ArrowUpOutlined />} disabled={!sel} onClick={() => act(() => st.move(sel!, -1))} /></Tooltip>
            <Tooltip title="Xuống"><Button icon={<ArrowDownOutlined />} disabled={!sel} onClick={() => act(() => st.move(sel!, 1))} /></Tooltip>
            <Tooltip title="Nối các việc đang chọn (Ctrl + bấm) theo thứ tự"><Button icon={<LinkOutlined />} onClick={linkChain} /></Tooltip>
            <Popconfirm title="Xóa công việc này (và các việc con)?" disabled={!sel} onConfirm={() => act(() => { st.deleteTasks([sel!]); setSelected(null) })}>
              <Button danger icon={<DeleteOutlined />} disabled={!sel} />
            </Popconfirm>
            <Divider type="vertical" />
          </>
        )}
        <Radio.Group size="small" value={zoom} onChange={(e) => setZoomState(e.target.value)} optionType="button"
          options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />
        <Checkbox checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)}>Đường găng</Checkbox>
        <Checkbox checked={showResources} onChange={(e) => setShowResources(e.target.checked)}>Nguồn lực</Checkbox>
        <Tooltip title={derived.data.baselines.length ? 'Thanh xám dưới mỗi công việc là kế hoạch gốc gần nhất' : 'Chưa lưu kế hoạch gốc (xem tab Theo dõi thực tế)'}>
          <Checkbox checked={showBaseline} disabled={!derived.data.baselines.length} onChange={(e) => setShowBaseline(e.target.checked)}>Kế hoạch gốc</Checkbox>
        </Tooltip>
      </div>
      <div ref={host} className="gantt-host" />
      <div className="no-print" style={{ fontSize: 12, color: '#6b7280', paddingTop: 4 }}>
        Bấm vào ô để sửa trực tiếp · cột Việc trước nhập theo STT, ví dụ "2, 3SS+2, 5FF-1" · kéo từ đầu thanh này sang thanh khác để tạo liên kết · kéo thanh để dời ngày (tạo ràng buộc "bắt đầu không sớm hơn")
      </div>
      <TaskDrawer taskId={editing} onClose={() => setEditing(null)} />
      <LinkModal link={editLink} onClose={() => setEditLink(null)} onError={(m) => message.error(m)} />
    </div>
  )
}

function LinkModal({ link, onClose, onError }: { link: Link | null; onClose(): void; onError(m: string): void }) {
  const [type, setType] = useState<LinkType>('FS')
  const [lag, setLag] = useState(0)
  const readOnly = useProject((s) => s.readOnly)
  const data = useProject((s) => s.data)
  useEffect(() => {
    if (link) {
      setType(link.type)
      setLag(link.lag)
    }
  }, [link])
  if (!link || !data) return null
  const name = (id: string) => data.tasks.find((t) => t.id === id)?.name ?? ''
  return (
    <Modal
      open
      title="Liên kết"
      onCancel={onClose}
      footer={readOnly ? null : [
        <Button key="del" danger onClick={() => { useProject.getState().deleteLink(link.id); onClose() }}>Xóa liên kết</Button>,
        <Button key="ok" type="primary" onClick={() => {
          try {
            useProject.getState().updateLink(link.id, { type, lag })
            onClose()
          } catch (e) {
            onError((e as Error).message)
          }
        }}>Lưu</Button>,
      ]}
    >
      <p><b>{name(link.predecessorId)}</b> → <b>{name(link.successorId)}</b></p>
      <Space wrap>
        <Select value={type} onChange={setType} style={{ width: 240 }} options={(Object.keys(LINK_LABEL) as LinkType[]).map((k) => ({ value: k, label: LINK_LABEL[k] }))} />
        <InputNumber value={lag} onChange={(v) => setLag(Number(v) || 0)} step={0.5} addonAfter="ngày chờ" />
      </Space>
    </Modal>
  )
}
