import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Row, Select, Slider, Space, Table, Tabs, Tag } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { assignmentCost } from '../core/cost'
import { newId } from '../core/id'
import { LINK_LABEL } from '../core/predecessors'
import type { Assignment, ConstraintType, Link, LinkType, Task } from '../core/types'
import { DATETIME_FMT, fmtDateTime, fmtDays, fmtVnd } from '../lib/format'
import { useProject } from '../store/projectStore'
import { useDerived } from '../store/useSchedule'
import { vndFormatter, vndParser } from './ProjectInfoFields'

const CONSTRAINTS: { value: ConstraintType; label: string }[] = [
  { value: 'ASAP', label: 'Càng sớm càng tốt' },
  { value: 'SNET', label: 'Bắt đầu không sớm hơn' },
  { value: 'FNET', label: 'Kết thúc không sớm hơn' },
  { value: 'MSO', label: 'Phải bắt đầu đúng ngày' },
]

type PredRow = Omit<Link, 'successorId'>
type AsgRow = Omit<Assignment, 'taskId'>

const toD = (s?: string) => (s ? dayjs(s) : undefined)
const fromD = (d?: Dayjs | null) => (d ? d.format('YYYY-MM-DDTHH:mm') : undefined)

export default function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose(): void }) {
  const derived = useDerived()!
  const readOnly = useProject((s) => s.readOnly)
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [preds, setPreds] = useState<PredRow[]>([])
  const [asg, setAsg] = useState<AsgRow[]>([])
  const { data, sched, rowOf } = derived
  const task = taskId ? data.tasks.find((t) => t.id === taskId) : undefined
  const s = taskId ? sched.tasks.get(taskId) : undefined
  const isSummary = !!s?.isSummary

  useEffect(() => {
    if (!task) return
    form.setFieldsValue({
      ...task,
      constraintDate: toD(task.constraintDate),
      actualStart: toD(task.actualStart),
      actualFinish: toD(task.actualFinish),
    })
    setPreds(data.links.filter((l) => l.successorId === task.id).map(({ successorId: _s, ...r }) => (void _s, r)))
    setAsg(data.assignments.filter((a) => a.taskId === task.id).map(({ taskId: _t, ...r }) => (void _t, r)))
    // chỉ nạp lại khi mở công việc khác
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const taskOptions = useMemo(
    () => sched.tree.ordered.filter((t) => t.id !== taskId).map((t) => ({ value: t.id, label: `${rowOf.get(t.id)}. ${sched.tasks.get(t.id)!.wbs} ${t.name}` })),
    [sched, rowOf, taskId],
  )
  const resById = new Map(data.resources.map((r) => [r.id, r]))
  const duration = Form.useWatch('duration', form) ?? task?.duration ?? 0

  if (!task || !s) return null

  const save = async () => {
    const v = await form.validateFields()
    const patch: Partial<Task> = {
      name: v.name,
      duration: isSummary ? task.duration : Number(v.duration) || 0,
      unit: v.unit || undefined,
      quantity: v.quantity ?? undefined,
      responsible: v.responsible || undefined,
      notes: v.notes || undefined,
      constraint: v.constraint,
      constraintDate: v.constraint === 'ASAP' ? undefined : fromD(v.constraintDate),
      percentComplete: v.percentComplete ?? 0,
      actualStart: fromD(v.actualStart),
      actualFinish: fromD(v.actualFinish),
      fixedCost: v.fixedCost || undefined,
    }
    if (patch.constraint !== 'ASAP' && !patch.constraintDate) {
      message.error('Chọn ngày cho ràng buộc')
      return
    }
    if (patch.actualFinish && !patch.actualStart) {
      message.error('Có ngày kết thúc thực tế thì phải có ngày bắt đầu thực tế')
      return
    }
    if (patch.actualFinish) patch.percentComplete = 100
    const st = useProject.getState()
    try {
      // gộp thành một bước hoàn tác
      st.apply((d) => {
        const tasks = d.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t))
        const links = [
          ...d.links.filter((l) => l.successorId !== task.id),
          ...preds.filter((p) => p.predecessorId).map((p) => ({ ...p, successorId: task.id })),
        ]
        const assignments = [
          ...d.assignments.filter((a) => a.taskId !== task.id),
          ...(isSummary ? [] : asg.filter((a) => a.resourceId).map((a) => ({ ...a, taskId: task.id }))),
        ]
        return { ...d, tasks, links, assignments }
      })
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const costOf = (a: AsgRow) => {
    const r = resById.get(a.resourceId)
    return r ? assignmentCost({ ...a, taskId: task.id }, r, Number(duration) || 0) : 0
  }
  const totalCost = asg.reduce((x, a) => x + costOf(a), 0) + (Number(form.getFieldValue('fixedCost')) || 0)

  return (
    <Drawer
      open
      width={720}
      title={`${s.wbs} ${task.name}`}
      onClose={onClose}
      extra={!readOnly && <Space><Button onClick={onClose}>Hủy</Button><Button type="primary" onClick={save}>Lưu</Button></Space>}
    >
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 16 }}
        items={[
          { label: 'Bắt đầu', children: fmtDateTime(s.start) },
          { label: 'Kết thúc', children: fmtDateTime(s.finish) },
          { label: 'ES / EF', children: `${round(s.es)} / ${round(s.ef)}` },
          { label: 'LS / LF', children: `${round(s.ls)} / ${round(s.lf)}` },
          { label: 'Dự trữ toàn phần', children: fmtDays(s.tf) },
          { label: 'Dự trữ riêng', children: <>{fmtDays(s.ff)} {s.critical && <Tag color="red">Găng</Tag>}</> },
        ]}
      />
      <Form form={form} layout="vertical" disabled={readOnly}>
        <Tabs
          items={[
            {
              key: 'info', label: 'Thông tin',
              children: (
                <Row gutter={12}>
                  <Col span={24}><Form.Item name="name" label="Tên công việc" rules={[{ required: true }]}><Input /></Form.Item></Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="duration" label="Thời gian (ngày)" tooltip="0 ngày = cột mốc">
                      <InputNumber min={0} step={0.5} style={{ width: '100%' }} disabled={isSummary} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}><Form.Item name="quantity" label="Khối lượng"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={4}><Form.Item name="unit" label="Đơn vị"><Input placeholder="m3" /></Form.Item></Col>
                  <Col xs={12} md={8}><Form.Item name="responsible" label="Người phụ trách"><Input /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="constraint" label="Ràng buộc"><Select options={CONSTRAINTS} /></Form.Item></Col>
                  <Col xs={24} md={12}>
                    <Form.Item noStyle shouldUpdate={(a, b) => a.constraint !== b.constraint}>
                      {({ getFieldValue }) => (
                        <Form.Item name="constraintDate" label="Ngày ràng buộc">
                          <DatePicker showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} style={{ width: '100%' }} disabled={getFieldValue('constraint') === 'ASAP'} />
                        </Form.Item>
                      )}
                    </Form.Item>
                  </Col>
                  <Col span={24}><Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item></Col>
                </Row>
              ),
            },
            {
              key: 'pred', label: `Việc trước (${preds.length})`,
              children: (
                <>
                  <Table<PredRow> size="small" rowKey="id" pagination={false} dataSource={preds}
                    columns={[
                      { title: 'Công việc', dataIndex: 'predecessorId', render: (v, r) => (
                        <Select showSearch optionFilterProp="label" value={v || undefined} style={{ width: '100%', minWidth: 260 }} options={taskOptions}
                          onChange={(id) => setPreds(preds.map((p) => (p.id === r.id ? { ...p, predecessorId: id } : p)))} />) },
                      { title: 'Quan hệ', dataIndex: 'type', width: 200, render: (v, r) => (
                        <Select value={v} style={{ width: '100%' }} options={(Object.keys(LINK_LABEL) as LinkType[]).map((k) => ({ value: k, label: LINK_LABEL[k] }))}
                          onChange={(type) => setPreds(preds.map((p) => (p.id === r.id ? { ...p, type } : p)))} />) },
                      { title: 'Chờ (ngày)', dataIndex: 'lag', width: 100, render: (v, r) => (
                        <InputNumber value={v} step={0.5} style={{ width: '100%' }} onChange={(lag) => setPreds(preds.map((p) => (p.id === r.id ? { ...p, lag: Number(lag) || 0 } : p)))} />) },
                      { width: 40, render: (_, r) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setPreds(preds.filter((p) => p.id !== r.id))} /> },
                    ]}
                  />
                  <Button icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setPreds([...preds, { id: newId(), predecessorId: '', type: 'FS', lag: 0 }])}>Thêm việc trước</Button>
                </>
              ),
            },
            ...(isSummary ? [] : [{
              key: 'res', label: `Nguồn lực (${asg.length})`,
              children: (
                <>
                  <Table<AsgRow> size="small" rowKey="id" pagination={false} dataSource={asg}
                    columns={[
                      { title: 'Nguồn lực', dataIndex: 'resourceId', render: (v, r) => (
                        <Select showSearch optionFilterProp="label" value={v || undefined} style={{ width: '100%', minWidth: 200 }}
                          options={data.resources.map((x) => ({ value: x.id, label: x.name }))}
                          onChange={(id) => setAsg(asg.map((a) => (a.id === r.id ? { ...a, resourceId: id } : a)))} />) },
                      { title: 'Số lượng', dataIndex: 'units', width: 150, render: (v, r) => {
                        const res = resById.get(r.resourceId)
                        const unit = res?.type === 'work' ? (res.isEquipment ? 'máy' : 'người') : res?.type === 'material' ? res.unit : '₫'
                        return <InputNumber value={v} min={0} style={{ width: '100%' }} addonAfter={unit}
                          formatter={res?.type === 'cost' ? vndFormatter : undefined} parser={res?.type === 'cost' ? vndParser : undefined}
                          onChange={(units) => setAsg(asg.map((a) => (a.id === r.id ? { ...a, units: Number(units) || 0 } : a)))} />
                      } },
                      { title: 'Thành tiền (₫)', width: 130, align: 'right', render: (_, r) => fmtVnd(costOf(r)) },
                      { width: 40, render: (_, r) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setAsg(asg.filter((a) => a.id !== r.id))} /> },
                    ]}
                  />
                  <Space style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }} wrap>
                    <Button icon={<PlusOutlined />} disabled={!data.resources.length} onClick={() => setAsg([...asg, { id: newId(), resourceId: '', units: 1 }])}>Thêm nguồn lực</Button>
                    <Form.Item name="fixedCost" label="Chi phí cố định (₫)" style={{ margin: 0 }} layout="horizontal">
                      <InputNumber min={0} style={{ width: 180 }} formatter={vndFormatter} parser={vndParser} />
                    </Form.Item>
                  </Space>
                  <p style={{ textAlign: 'right', fontWeight: 600 }}>Tổng chi phí: {fmtVnd(totalCost)} ₫</p>
                  {!data.resources.length && <p>Chưa có nguồn lực. Khai báo ở tab "Nguồn lực & chi phí".</p>}
                </>
              ),
            }]),
            {
              key: 'progress', label: 'Tiến độ thực tế',
              children: (
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Item name="percentComplete" label="% hoàn thành" >
                      <Slider marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }} disabled={isSummary || readOnly} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}><Form.Item name="actualStart" label="Bắt đầu thực tế"><DatePicker showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} style={{ width: '100%' }} disabled={isSummary} /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="actualFinish" label="Kết thúc thực tế"><DatePicker showTime={{ format: 'HH:mm' }} format={DATETIME_FMT} style={{ width: '100%' }} disabled={isSummary} /></Form.Item></Col>
                </Row>
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  )
}

const round = (x: number) => Math.round(x * 100) / 100
