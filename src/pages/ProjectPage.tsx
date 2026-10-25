import { ArrowLeftOutlined, CheckCircleOutlined, CloudSyncOutlined, DownOutlined, ExclamationCircleOutlined, ExportOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons'
import { Alert, App, Button, Dropdown, Space, Spin, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CpmTable from '../components/CpmTable'
import GanttView from '../components/GanttView'
import NetworkDiagram from '../components/NetworkDiagram'
import ProjectSettings from '../components/ProjectSettings'
import ResourcesView from '../components/ResourcesView'
import TrackingView from '../components/TrackingView'
import { exportMspdi } from '../core/mspdi'
import { downloadText, fmtDate, safeFileName } from '../lib/format'
import { useProject } from '../store/projectStore'
import { useDerived } from '../store/useSchedule'
import type { ProjectSummary } from '../data/repo'

const TABS = [
  { key: 'gantt', label: 'Tiến độ (Gantt)' },
  { key: 'cpm', label: 'Bảng CPM' },
  { key: 'network', label: 'Sơ đồ mạng' },
  { key: 'resources', label: 'Nguồn lực & chi phí' },
  { key: 'tracking', label: 'Theo dõi thực tế' },
  { key: 'settings', label: 'Thiết lập' },
]

export default function ProjectPage() {
  const { id, tab = 'gantt' } = useParams()
  const nav = useNavigate()
  const { message } = App.useApp()
  const repo = useProject((s) => s.repo)!
  const open = useProject((s) => s.open)
  const close = useProject((s) => s.close)
  const saveState = useProject((s) => s.saveState)
  const saveError = useProject((s) => s.saveError)
  const readOnly = useProject((s) => s.readOnly)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const derived = useDerived()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    setError(undefined)
    repo
      .loadProject(id!)
      .then((d) => {
        if (!alive) return
        const role = (d as unknown as { myRole?: ProjectSummary['myRole'] }).myRole
        open(d, repo.kind === 'supabase' && !!role && !['quan_tri', 'chu_nhiem'].includes(role), role)
      })
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
      void close()
    }
  }, [id, repo, open, close])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable=true]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  if (error) return <div className="page"><Alert type="error" showIcon message={error} action={<Link to="/">Về danh sách</Link>} /></div>
  if (!derived || derived.data.project.id !== id) return <Spin fullscreen />
  const { data, sched, costs } = derived
  const p = data.project

  const doExport = async (key: string) => {
    const base = safeFileName(p.name)
    if (key === 'xml') downloadText(`${base}.xml`, exportMspdi(data), 'application/xml')
    if (key === 'json') downloadText(`${base}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1))
    if (key === 'xlsx') {
      const { exportExcel } = await import('../lib/excel')
      await exportExcel(derived)
    }
    if (key === 'print') window.print()
    message.success('Đã xuất tệp')
  }

  const saveTag = {
    saved: <Tag icon={<CheckCircleOutlined />} color="success">Đã lưu</Tag>,
    dirty: <Tag icon={<CloudSyncOutlined />} color="processing">Chưa lưu</Tag>,
    saving: <Tag icon={<CloudSyncOutlined spin />} color="processing">Đang lưu</Tag>,
    error: <Tooltip title={saveError}><Tag icon={<ExclamationCircleOutlined />} color="error">Lỗi lưu</Tag></Tooltip>,
  }[saveState]

  return (
    <div className="full-height" style={{ padding: '8px 16px 0' }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav('/')} />
        <Typography.Title level={5} style={{ margin: 0 }}>{p.code ? `${p.code} · ` : ''}{p.name}</Typography.Title>
        <Typography.Text type="secondary">
          {fmtDate(sched.projectStart)} → {fmtDate(sched.projectFinish)} · {sched.projectDuration} ngày làm việc · {costs.total.toLocaleString('vi-VN')} ₫
        </Typography.Text>
        <span style={{ flex: 1 }} />
        {readOnly ? <Tag color="default">Chỉ xem</Tag> : saveTag}
        <Space.Compact>
          <Button icon={<UndoOutlined />} disabled={!canUndo} onClick={undo} title="Hoàn tác (Ctrl+Z)" />
          <Button icon={<RedoOutlined />} disabled={!canRedo} onClick={redo} title="Làm lại (Ctrl+Y)" />
        </Space.Compact>
        <Dropdown
          menu={{
            items: [
              { key: 'xlsx', label: 'Excel (tiến độ, CPM, chi phí)' },
              { key: 'xml', label: 'MS Project XML' },
              { key: 'json', label: 'Sao lưu dự án (JSON)' },
              { key: 'print', label: 'In trang đang xem' },
            ],
            onClick: ({ key }) => void doExport(key),
          }}
        >
          <Button icon={<ExportOutlined />}>Xuất <DownOutlined /></Button>
        </Dropdown>
      </div>
      {sched.warnings.length > 0 && <Alert type="warning" showIcon message={sched.warnings.join('; ')} style={{ marginTop: 8 }} />}
      <Tabs
        activeKey={tab}
        onChange={(k) => nav(`/p/${id}/${k}`)}
        items={TABS.map((t) => ({ ...t, children: null }))}
        style={{ marginBottom: 0 }}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
        {tab === 'gantt' && <GanttView />}
        {tab === 'cpm' && <CpmTable />}
        {tab === 'network' && <NetworkDiagram />}
        {tab === 'resources' && <ResourcesView />}
        {tab === 'tracking' && <TrackingView />}
        {tab === 'settings' && <ProjectSettings />}
      </div>
    </div>
  )
}
