import { Alert, Checkbox, Radio, Space, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import type { ScheduledTask } from '../core/cpm'
import { fmtDate } from '../lib/format'
import { useDerived } from '../store/useSchedule'

// Bảng thông số sơ đồ mạng (TD-03, TD-07): ES, EF, LS, LF, TF, FF theo ngày làm việc.

const r2 = (x: number) => Math.round(x * 100) / 100

export default function CpmTable() {
  const { data, sched, rowOf } = useDerived()!
  const [mode, setMode] = useState<'days' | 'dates'>('days')
  const [onlyCritical, setOnlyCritical] = useState(false)
  const [hideSummary, setHideSummary] = useState(false)
  const level = sched.tree.level

  const rows = sched.tree.ordered
    .map((t) => ({ t, s: sched.tasks.get(t.id)! }))
    .filter(({ s }) => (!onlyCritical || s.critical) && (!hideSummary || !s.isSummary))

  const critical = sched.tree.ordered
    .map((t) => sched.tasks.get(t.id)!)
    .filter((s) => s.critical && !s.isSummary)
    .sort((a, b) => a.es - b.es || a.ef - b.ef)
  const val = (s: ScheduledTask, k: 'es' | 'ef' | 'ls' | 'lf') =>
    mode === 'days' ? r2(s[k]) : fmtDate(k === 'es' ? s.start : k === 'ef' ? s.finish : k === 'ls' ? s.lateStart : s.lateFinish)

  return (
    <div style={{ overflow: 'auto' }}>
      <div className="toolbar no-print">
        <Radio.Group size="small" optionType="button" value={mode} onChange={(e) => setMode(e.target.value)}
          options={[{ value: 'days', label: 'Theo ngày thứ' }, { value: 'dates', label: 'Theo ngày lịch' }]} />
        <Checkbox checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)}>Chỉ công việc găng</Checkbox>
        <Checkbox checked={hideSummary} onChange={(e) => setHideSummary(e.target.checked)}>Ẩn hạng mục tổng hợp</Checkbox>
      </div>
      <Alert
        type="info"
        style={{ marginBottom: 8 }}
        message={
          <Space direction="vertical" size={2}>
            <span>
              Thời gian hoàn thành ngắn nhất: <b>{sched.projectDuration} ngày làm việc</b> ({fmtDate(sched.projectStart)} → {fmtDate(sched.projectFinish)}).
              ES tính từ 0 tại thời điểm khởi công; EF = ES + D; LS = LF − D; TF = LS − ES; FF = ES(sau) − EF.
            </span>
            <span>
              Đường găng: {critical.length ? critical.map((s) => `${rowOf.get(s.id)}`).join(' → ') : 'không có (mọi việc đã hoàn thành)'}
            </span>
          </Space>
        }
      />
      <Table
        size="small"
        rowKey={(r) => r.t.id}
        pagination={false}
        dataSource={rows}
        scroll={{ x: 900 }}
        rowClassName={({ s }) => (s.isSummary ? 'summary-row' : '')}
        columns={[
          { title: 'STT', width: 50, align: 'center', render: (_, { t }) => rowOf.get(t.id) },
          { title: 'WBS', width: 70, render: (_, { s }) => s.wbs },
          {
            title: 'Công việc',
            render: (_, { t, s }) => (
              <span style={{ paddingLeft: (level.get(t.id) ?? 0) * 16, fontWeight: s.isSummary ? 600 : undefined }}>{t.name}</span>
            ),
          },
          { title: 'D', width: 60, align: 'right', render: (_, { t, s }) => r2(s.isSummary ? s.duration : t.duration) },
          { title: 'ES', width: 90, align: 'right', render: (_, { s }) => val(s, 'es') },
          { title: 'EF', width: 90, align: 'right', render: (_, { s }) => val(s, 'ef') },
          { title: 'LS', width: 90, align: 'right', render: (_, { s }) => val(s, 'ls') },
          { title: 'LF', width: 90, align: 'right', render: (_, { s }) => val(s, 'lf') },
          { title: 'TF', width: 60, align: 'right', render: (_, { s }) => (s.isSummary ? '' : <span style={{ color: s.tf < 0 ? '#c4373c' : undefined }}>{r2(s.tf)}</span>) },
          { title: 'FF', width: 60, align: 'right', render: (_, { s }) => (s.isSummary ? '' : r2(s.ff)) },
          {
            title: 'Găng', width: 80, align: 'center',
            render: (_, { s }) => (s.complete ? <Tag color="green">Xong</Tag> : s.critical && !s.isSummary ? <Tag color="red">Găng</Tag> : ''),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        {data.tasks.length} công việc, {data.links.length} liên kết. TF âm nghĩa là có ràng buộc ngày làm dự án không kịp tiến độ.
      </Typography.Paragraph>
    </div>
  )
}
