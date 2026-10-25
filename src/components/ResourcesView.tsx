import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Statistic, Table, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { assignmentCost, resourceLabel } from '../core/cost'
import { newId } from '../core/id'
import type { Resource, ResourceType } from '../core/types'
import { fmtNum, fmtVnd } from '../lib/format'
import { useProject } from '../store/projectStore'
import { useDerived } from '../store/useSchedule'
import { vndFormatter, vndParser } from './ProjectInfoFields'

// Danh mục nguồn lực (NS-01, NS-02) và chi phí theo công việc (CP-01, CP-02).

export const RES_TYPE: Record<ResourceType, { label: string; color: string }> = {
  work: { label: 'Nhân công / máy', color: 'blue' },
  material: { label: 'Vật tư', color: 'green' },
  cost: { label: 'Chi phí', color: 'orange' },
}

export default function ResourcesView() {
  const { data, sched, costs } = useDerived()!
  const readOnly = useProject((s) => s.readOnly)
  const [edit, setEdit] = useState<Resource | null>(null)

  const usage = useMemo(() => {
    const m = new Map<string, { qty: number; cost: number; tasks: number }>()
    for (const a of data.assignments) {
      const r = data.resources.find((x) => x.id === a.resourceId)
      const t = data.tasks.find((x) => x.id === a.taskId)
      if (!r || !t) continue
      const u = m.get(r.id) ?? { qty: 0, cost: 0, tasks: 0 }
      u.qty += r.type === 'work' ? a.units * t.duration : a.units
      u.cost += assignmentCost(a, r, t.duration)
      u.tasks += 1
      m.set(r.id, u)
    }
    return m
  }, [data])

  const budget = data.project.budget
  const level = sched.tree.level

  return (
    <div style={{ overflow: 'auto' }}>
      <Row gutter={12} className="stat-row" style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng chi phí kế hoạch (₫)" value={costs.total} formatter={(v) => fmtVnd(Number(v))} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Ngân sách (₫)" value={budget ?? 0} formatter={(v) => (budget ? fmtVnd(Number(v)) : 'Chưa nhập')} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Còn lại so với ngân sách (₫)" value={budget ? budget - costs.total : 0} valueStyle={{ color: budget && budget < costs.total ? '#c4373c' : undefined }} formatter={(v) => (budget ? fmtVnd(Number(v)) : '')} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Số nguồn lực" value={data.resources.length} /></Card></Col>
      </Row>

      <Card size="small" title="Danh mục nguồn lực" extra={!readOnly && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdit({ id: newId(), name: '', type: 'work', unit: 'công', rate: 0, costPerUse: 0 })}>Thêm nguồn lực</Button>}>
        <Table
          size="small" rowKey="id" pagination={false} dataSource={data.resources} scroll={{ x: 800 }}
          columns={[
            { title: 'Tên', dataIndex: 'name' },
            { title: 'Loại', dataIndex: 'type', width: 150, render: (t: ResourceType, r) => <Tag color={RES_TYPE[t].color}>{r.isEquipment ? 'Máy thi công' : RES_TYPE[t].label}</Tag> },
            { title: 'Đơn vị', dataIndex: 'unit', width: 80 },
            { title: 'Đơn giá (₫)', dataIndex: 'rate', width: 130, align: 'right', render: (v, r) => (r.type === 'cost' ? '' : `${fmtVnd(v)}${r.type === 'work' ? (r.isEquipment ? '/ca' : '/công') : `/${r.unit ?? ''}`}`) },
            { title: 'Phí mỗi lần dùng', dataIndex: 'costPerUse', width: 130, align: 'right', render: (v) => (v ? fmtVnd(v) : '') },
            { title: 'Tổ đội / nhóm', dataIndex: 'group', width: 130, responsive: ['md'] },
            { title: 'Tổng khối lượng', width: 140, align: 'right', render: (_, r) => {
              const u = usage.get(r.id)
              if (!u || r.type === 'cost') return ''
              return `${fmtNum(u.qty)} ${r.type === 'work' ? (r.isEquipment ? 'ca' : 'công') : r.unit ?? ''}`
            } },
            { title: 'Thành tiền (₫)', width: 140, align: 'right', render: (_, r) => fmtVnd(usage.get(r.id)?.cost ?? 0) },
            ...(readOnly ? [] : [{
              width: 80, render: (_: unknown, r: Resource) => (
                <>
                  <Button type="text" icon={<EditOutlined />} onClick={() => setEdit(r)} />
                  <Popconfirm title="Xóa nguồn lực và các phân bổ của nó?" onConfirm={() => useProject.getState().deleteResource(r.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </>
              ),
            }]),
          ]}
        />
      </Card>

      <Card size="small" title="Chi phí theo công việc" style={{ marginTop: 12 }}>
        <Table
          size="small" rowKey={(r) => r.id} pagination={false} scroll={{ x: 800 }}
          dataSource={sched.tree.ordered}
          rowClassName={(t) => (sched.tree.isSummary(t.id) ? 'summary-row' : '')}
          columns={[
            { title: 'WBS', width: 70, render: (_, t) => sched.tasks.get(t.id)!.wbs },
            { title: 'Công việc', render: (_, t) => <span style={{ paddingLeft: (level.get(t.id) ?? 0) * 16, fontWeight: sched.tree.isSummary(t.id) ? 600 : undefined }}>{t.name}</span> },
            { title: 'Thời gian', width: 90, align: 'right', render: (_, t) => fmtNum(sched.tasks.get(t.id)!.isSummary ? sched.tasks.get(t.id)!.duration : t.duration) },
            { title: 'Nhân công - Vật tư - Máy', render: (_, t) => resourceLabel(t.id, data.resources, data.assignments) },
            { title: 'Chi phí (₫)', width: 140, align: 'right', render: (_, t) => <b style={{ fontWeight: sched.tree.isSummary(t.id) ? 600 : 400 }}>{fmtVnd(costs.byTask.get(t.id) ?? 0)}</b> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}><b>Tổng cộng</b></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><b>{fmtVnd(costs.total)}</b></Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
      <ResourceModal res={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function ResourceModal({ res, onClose }: { res: Resource | null; onClose(): void }) {
  const [form] = Form.useForm()
  if (!res) return null
  return (
    <Modal
      open
      title={res.name ? `Sửa nguồn lực: ${res.name}` : 'Thêm nguồn lực'}
      onCancel={onClose}
      destroyOnHidden
      onOk={async () => {
        const v = await form.validateFields()
        useProject.getState().upsertResource({ ...res, ...v, rate: v.rate ?? 0, costPerUse: v.costPerUse ?? 0 })
        onClose()
      }}
    >
      <Form form={form} layout="vertical" initialValues={res}>
        <Form.Item name="name" label="Tên nguồn lực" rules={[{ required: true }]}><Input placeholder="Công nhân cốt pha, Bê tông M250, Máy đào..." /></Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="type" label="Loại">
              <Select options={[
                { value: 'work', label: 'Nhân công / máy (theo ngày)' },
                { value: 'material', label: 'Vật tư (theo khối lượng)' },
                { value: 'cost', label: 'Chi phí (nhập số tiền)' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item name="unit" label="Đơn vị"><Input placeholder="công, ca, m3, tấn..." /></Form.Item></Col>
        </Row>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => getFieldValue('type') !== 'cost' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="rate" label={getFieldValue('type') === 'work' ? 'Đơn giá một ngày (₫)' : 'Đơn giá một đơn vị (₫)'}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={vndFormatter} parser={vndParser} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="costPerUse" label="Phí mỗi lần dùng (₫)" tooltip="Ví dụ phí vận chuyển máy, phí bơm bê tông">
                  <InputNumber min={0} style={{ width: '100%' }} formatter={vndFormatter} parser={vndParser} />
                </Form.Item>
              </Col>
              {getFieldValue('type') === 'work' && (
                <Col span={24}><Form.Item name="isEquipment" valuePropName="checked"><Checkbox>Là máy thi công (tính theo ca máy)</Checkbox></Form.Item></Col>
              )}
            </Row>
          )}
        </Form.Item>
        <Form.Item name="group" label="Tổ đội / nhóm"><Input /></Form.Item>
      </Form>
    </Modal>
  )
}
