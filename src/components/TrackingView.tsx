import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Checkbox, Col, DatePicker, Input, InputNumber, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { CalendarIndex } from '../core/calendar'
import { createBaseline, STATUS_LABEL, trackProgress, type TrackStatus } from '../core/tracking'
import { DATE_FMT, DATETIME_FMT, fmtDate, fmtDateTime, fmtVnd } from '../lib/format'
import { useProject } from '../store/projectStore'
import { useDerived } from '../store/useSchedule'

// Theo dõi tiến độ thực tế so với kế hoạch gốc (TD-04, TD-05, CV-06).

const STATUS_COLOR: Record<TrackStatus, string> = {
  hoan_thanh: 'green', dang_lam: 'blue', chua_bat_dau: 'default', tre_han: 'red', cham: 'orange', sap_den_han: 'gold',
}

export default function TrackingView() {
  const derived = useDerived()!
  const { data, sched, costs } = derived
  const readOnly = useProject((s) => s.readOnly)
  const { modal, message } = App.useApp()
  const [blId, setBlId] = useState<string | undefined>()
  const [filter, setFilter] = useState<TrackStatus[]>([])
  const st = useProject.getState()
  const canEdit = useProject((s) => s.canProgress())
  const prog = (id: string, patch: Parameters<typeof st.progress>[1]) => st.progress(id, patch).catch((e) => message.error((e as Error).message))
  const p = data.project
  const baseline = data.baselines.find((b) => b.id === blId) ?? data.baselines[data.baselines.length - 1]

  const rows = useMemo(() => trackProgress(data, baseline, sched), [data, baseline, sched])
  const byId = new Map(rows.map((r) => [r.taskId, r]))
  const level = sched.tree.level

  const leaves = sched.tree.ordered.filter((t) => !sched.tree.isSummary(t.id))
  const totalDur = leaves.reduce((s, t) => s + t.duration, 0)
  const pct = totalDur ? leaves.reduce((s, t) => s + (sched.tasks.get(t.id)!.percentComplete * t.duration), 0) / totalDur : 0
  const late = rows.filter((r) => !sched.tasks.get(r.taskId)!.isSummary && (r.status === 'tre_han' || r.status === 'cham')).length
  const blFinish = baseline?.entries.reduce<string | undefined>((m, e) => (!m || e.finish > m ? e.finish : m), undefined)
  const cal = new CalendarIndex(p.calendar, p.start)
  const finishVar = blFinish ? Math.round(((cal.toMinutes(sched.projectFinish) - cal.toMinutes(blFinish)) / cal.mpd) * 10) / 10 : undefined

  const saveBaseline = () => {
    let name = `Kế hoạch gốc ${dayjs().format('DD/MM/YYYY HH:mm')}`
    modal.confirm({
      title: 'Lưu kế hoạch gốc (baseline)',
      content: (
        <>
          <p>Chụp lại ngày bắt đầu, kết thúc, thời gian và chi phí hiện tại của mọi công việc để so sánh về sau.</p>
          <Input defaultValue={name} onChange={(e) => (name = e.target.value)} />
        </>
      ),
      okText: 'Lưu',
      onOk: () => {
        const b = createBaseline(data, name, sched)
        st.addBaseline(b)
        setBlId(b.id)
        message.success('Đã lưu kế hoạch gốc')
      },
    })
  }

  const shown = sched.tree.ordered.filter((t) => !filter.length || filter.includes(byId.get(t.id)!.status))

  return (
    <div style={{ overflow: 'auto' }}>
      <div className="toolbar no-print">
        <span>Ngày cập nhật:</span>
        <DatePicker value={p.statusDate ? dayjs(p.statusDate) : null} format={DATE_FMT} disabled={readOnly} allowClear
          onChange={(d) => st.updateProject({ statusDate: d ? d.format('YYYY-MM-DD') : undefined })} />
        <Tooltip title="Việc chưa làm xong được dời ra sau ngày cập nhật để dự báo ngày hoàn thành theo thực tế">
          <Checkbox checked={p.rescheduleAfterStatus !== false} disabled={readOnly} onChange={(e) => st.updateProject({ rescheduleAfterStatus: e.target.checked })}>
            Dời phần việc còn lại ra sau ngày cập nhật
          </Checkbox>
        </Tooltip>
        <span style={{ flex: 1 }} />
        <span>So với:</span>
        <Select style={{ width: 260 }} value={baseline?.id} placeholder="Chưa có kế hoạch gốc" onChange={setBlId}
          options={data.baselines.map((b) => ({ value: b.id, label: `${b.name}` }))} />
        {!readOnly && <Button icon={<SaveOutlined />} type="primary" onClick={saveBaseline}>Lưu kế hoạch gốc</Button>}
        {!readOnly && baseline && (
          <Popconfirm title="Xóa kế hoạch gốc này?" onConfirm={() => { st.deleteBaseline(baseline.id); setBlId(undefined) }}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </div>
      {!baseline && <Alert type="info" showIcon style={{ marginBottom: 8 }} message='Hãy bấm "Lưu kế hoạch gốc" khi tiến độ đã được duyệt, rồi cập nhật % hoàn thành và ngày thực tế để so sánh.' />}
      <Row gutter={12} className="stat-row" style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Hoàn thành (theo thời gian)" value={pct} precision={1} suffix="%" /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Việc trễ / chậm" value={late} valueStyle={{ color: late ? '#c4373c' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Dự kiến hoàn thành" value={fmtDate(sched.projectFinish)} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={blFinish ? `So với kế hoạch gốc (${fmtDate(blFinish)})` : 'So với kế hoạch gốc'}
              value={finishVar === undefined ? '-' : finishVar === 0 ? 'Đúng hạn' : finishVar > 0 ? `Trễ ${finishVar} ngày` : `Sớm ${-finishVar} ngày`}
              valueStyle={{ color: finishVar && finishVar > 0 ? '#c4373c' : finishVar && finishVar < 0 ? '#3f8a35' : undefined }} />
          </Card>
        </Col>
      </Row>
      <Space style={{ marginBottom: 8 }} wrap>
        <span>Lọc:</span>
        {(Object.keys(STATUS_LABEL) as TrackStatus[]).map((k) => (
          <Tag.CheckableTag key={k} checked={filter.includes(k)} onChange={(c) => setFilter(c ? [...filter, k] : filter.filter((x) => x !== k))}>
            {STATUS_LABEL[k]} ({rows.filter((r) => r.status === k && !sched.tasks.get(r.taskId)!.isSummary).length})
          </Tag.CheckableTag>
        ))}
        <span style={{ color: '#6b7280' }}>Chi phí kế hoạch: {fmtVnd(costs.total)} ₫</span>
      </Space>
      <Table
        size="small" rowKey="id" pagination={false} dataSource={shown} scroll={{ x: 1300 }}
        rowClassName={(t) => (sched.tree.isSummary(t.id) ? 'summary-row' : '')}
        columns={[
          { title: 'WBS', width: 60, fixed: 'left', render: (_, t) => sched.tasks.get(t.id)!.wbs },
          { title: 'Công việc', width: 240, fixed: 'left', render: (_, t) => <span style={{ paddingLeft: (level.get(t.id) ?? 0) * 14 }}>{t.name}</span> },
          { title: 'KH gốc bắt đầu', width: 105, render: (_, t) => fmtDate(byId.get(t.id)!.baselineStart) },
          { title: 'KH gốc kết thúc', width: 105, render: (_, t) => fmtDate(byId.get(t.id)!.baselineFinish) },
          { title: 'Bắt đầu', width: 100, render: (_, t) => fmtDate(byId.get(t.id)!.start) },
          { title: 'Kết thúc', width: 100, render: (_, t) => fmtDate(byId.get(t.id)!.finish) },
          { title: 'Lệch KT (ngày)', width: 90, align: 'right', render: (_, t) => {
            const v = byId.get(t.id)!.finishVariance
            return v === undefined ? '' : <span style={{ color: v > 0 ? '#c4373c' : v < 0 ? '#3f8a35' : undefined }}>{v > 0 ? `+${v}` : v}</span>
          } },
          { title: '% kế hoạch', width: 85, align: 'right', render: (_, t) => `${byId.get(t.id)!.expectedPercent ?? 0}%` },
          { title: '% thực tế', width: 105, render: (_, t) => sched.tree.isSummary(t.id) || !canEdit ? `${Math.round(sched.tasks.get(t.id)!.percentComplete)}%` : (
            <InputNumber size="small" min={0} max={100} value={t.percentComplete} addonAfter="%" style={{ width: 95 }}
              onChange={(v) => {
                const pc = Number(v) || 0
                const patch: Partial<typeof t> = { percentComplete: pc }
                if (pc > 0 && !t.actualStart) patch.actualStart = sched.tasks.get(t.id)!.start
                if (pc >= 100 && !t.actualFinish) patch.actualFinish = sched.tasks.get(t.id)!.finish
                if (pc < 100) patch.actualFinish = undefined
                void prog(t.id, patch)
              }} />
          ) },
          { title: 'Bắt đầu thực tế', width: 160, render: (_, t) => sched.tree.isSummary(t.id) || !canEdit ? fmtDateTime(t.actualStart) : (
            <DatePicker size="small" showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} value={t.actualStart ? dayjs(t.actualStart) : null}
              onChange={(d) => void prog(t.id, { actualStart: d ? d.format('YYYY-MM-DDTHH:mm') : undefined, ...(d ? {} : { actualFinish: undefined, percentComplete: 0 }) })} />
          ) },
          { title: 'Kết thúc thực tế', width: 160, render: (_, t) => sched.tree.isSummary(t.id) || !canEdit ? fmtDateTime(t.actualFinish) : (
            <DatePicker size="small" showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} value={t.actualFinish ? dayjs(t.actualFinish) : null} disabled={!t.actualStart}
              onChange={(d) => void prog(t.id, d ? { actualFinish: d.format('YYYY-MM-DDTHH:mm'), percentComplete: 100 } : { actualFinish: undefined })} />
          ) },
          { title: 'Tình trạng', width: 140, render: (_, t) => {
            const s = byId.get(t.id)!.status
            return <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>
          } },
        ]}
      />
    </div>
  )
}
