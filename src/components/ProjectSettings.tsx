import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Checkbox, Col, DatePicker, Form, Input, Popconfirm, Row, Select, Space, Table, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { minutesPerDay } from '../core/calendar'
import { SUPPORTED_HOLIDAY_YEARS, vietnamHolidays } from '../core/holidays'
import type { WorkCalendar } from '../core/types'
import { ROLE_LABEL, type Member, type MemberRole } from '../data/repo'
import { DATE_FMT, fmtDate } from '../lib/format'
import { useProject } from '../store/projectStore'
import ProjectInfoFields from './ProjectInfoFields'

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export default function ProjectSettings() {
  const data = useProject((s) => s.data)!
  const readOnly = useProject((s) => s.readOnly)
  const repo = useProject((s) => s.repo)!
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const p = data.project

  useEffect(() => {
    form.setFieldsValue({ ...p, start: dayjs(p.start) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id])

  const saveInfo = async () => {
    const v = await form.validateFields()
    useProject.getState().updateProject({ ...v, start: (v.start as Dayjs).format('YYYY-MM-DDTHH:mm') })
    message.success('Đã cập nhật thông tin dự án')
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <Row gutter={12}>
        <Col xs={24} xl={12}>
          <Card size="small" title="Thông tin dự án" extra={!readOnly && <Button type="primary" onClick={saveInfo}>Lưu thông tin</Button>}>
            <Form form={form} layout="vertical" disabled={readOnly}>
              <ProjectInfoFields />
            </Form>
          </Card>
          {repo.kind === 'supabase' && <MembersCard projectId={p.id} />}
        </Col>
        <Col xs={24} xl={12}>
          <CalendarCard calendar={p.calendar} readOnly={readOnly} onChange={(calendar) => useProject.getState().updateProject({ calendar })} />
        </Col>
      </Row>
    </div>
  )
}

function CalendarCard({ calendar, readOnly, onChange }: { calendar: WorkCalendar; readOnly: boolean; onChange(c: WorkCalendar): void }) {
  const { message } = App.useApp()
  const [year, setYear] = useState(new Date().getFullYear())
  const [newDay, setNewDay] = useState<Dayjs | null>(null)
  const [newName, setNewName] = useState('')
  const update = (c: Partial<WorkCalendar>) => {
    try {
      onChange({ ...calendar, ...c })
    } catch (e) {
      message.error((e as Error).message)
    }
  }
  const hours = minutesPerDay(calendar) / 60

  return (
    <Card size="small" title="Lịch làm việc của dự án">
      <Typography.Text strong>Ngày làm việc trong tuần</Typography.Text>
      <div style={{ margin: '6px 0 12px' }}>
        <Checkbox.Group disabled={readOnly} value={calendar.workingWeekdays}
          options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: WEEKDAYS[d] }))}
          onChange={(v) => (v.length ? update({ workingWeekdays: (v as number[]).sort() }) : message.warning('Cần ít nhất một ngày làm việc'))} />
      </div>
      <Typography.Text strong>Ca làm việc ({hours} giờ/ngày, 1 ngày công = {hours} giờ)</Typography.Text>
      <div style={{ margin: '6px 0 12px' }}>
        {calendar.intervals.map((iv, i) => (
          <Space key={i} style={{ marginBottom: 6 }}>
            <TimePicker.RangePicker format="HH:mm" minuteStep={15} disabled={readOnly} allowClear={false}
              value={[dayjs(`2000-01-01T${iv.from}`), dayjs(`2000-01-01T${iv.to}`)]}
              onChange={(v) => {
                if (!v?.[0] || !v[1]) return
                const intervals = calendar.intervals.map((x, j) => (j === i ? { from: v[0]!.format('HH:mm'), to: v[1]!.format('HH:mm') } : x))
                update({ intervals: intervals.sort((a, b) => a.from.localeCompare(b.from)) })
              }} />
            {!readOnly && calendar.intervals.length > 1 && (
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => update({ intervals: calendar.intervals.filter((_, j) => j !== i) })} />
            )}
          </Space>
        ))}
        {!readOnly && <div><Button size="small" icon={<PlusOutlined />} onClick={() => update({ intervals: [...calendar.intervals, { from: '18:00', to: '21:00' }] })}>Thêm ca</Button></div>}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Đổi ca làm việc sẽ đổi số giờ của một ngày công, thời lượng các công việc (tính theo ngày) được giữ nguyên.
        </Typography.Paragraph>
      </div>

      <Typography.Text strong>Ngày nghỉ lễ, nghỉ đột xuất ({calendar.holidays.length})</Typography.Text>
      {!readOnly && (
        <Space wrap style={{ margin: '6px 0' }}>
          <Select value={year} onChange={setYear} style={{ width: 90 }} options={SUPPORTED_HOLIDAY_YEARS.map((y) => ({ value: y, label: y }))} />
          <Button onClick={() => {
            const have = new Set(calendar.holidays.map((h) => h.date))
            const add = vietnamHolidays(year).filter((h) => !have.has(h.date))
            update({ holidays: [...calendar.holidays, ...add].sort((a, b) => a.date.localeCompare(b.date)) })
            message.success(`Đã thêm ${add.length} ngày nghỉ lễ năm ${year}. Kiểm tra lại theo thông báo chính thức.`)
          }}>Thêm ngày lễ Việt Nam</Button>
        </Space>
      )}
      {!readOnly && (
        <Space wrap style={{ marginBottom: 6 }}>
          <DatePicker value={newDay} onChange={setNewDay} format={DATE_FMT} placeholder="Ngày nghỉ" />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Lý do (mưa bão, cúp điện...)" style={{ width: 220 }} />
          <Button icon={<PlusOutlined />} disabled={!newDay} onClick={() => {
            const date = newDay!.format('YYYY-MM-DD')
            update({ holidays: [...calendar.holidays.filter((h) => h.date !== date), { date, name: newName || 'Ngày nghỉ' }].sort((a, b) => a.date.localeCompare(b.date)) })
            setNewDay(null)
            setNewName('')
          }}>Thêm</Button>
        </Space>
      )}
      <Table size="small" rowKey="date" pagination={{ pageSize: 8, size: 'small' }} dataSource={calendar.holidays}
        columns={[
          { title: 'Ngày', dataIndex: 'date', width: 110, render: fmtDate },
          { title: 'Thứ', dataIndex: 'date', width: 90, render: (d: string) => WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()] },
          { title: 'Tên', dataIndex: 'name' },
          ...(readOnly ? [] : [{ width: 40, render: (_: unknown, h: { date: string }) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => update({ holidays: calendar.holidays.filter((x) => x.date !== h.date) })} /> }]),
        ]} />

      <Typography.Text strong>Ngày làm bù (làm việc dù là ngày nghỉ)</Typography.Text>
      <div style={{ marginTop: 6 }}>
        <Space wrap>
          {(calendar.extraWorkingDays ?? []).map((d) => (
            <Button key={d} size="small" disabled={readOnly} onClick={() => update({ extraWorkingDays: calendar.extraWorkingDays!.filter((x) => x !== d) })}>{fmtDate(d)} ✕</Button>
          ))}
          {!readOnly && (
            <DatePicker size="small" format={DATE_FMT} placeholder="Thêm ngày làm bù" value={null}
              onChange={(v: Dayjs | null) => v && update({ extraWorkingDays: [...new Set([...(calendar.extraWorkingDays ?? []), v.format('YYYY-MM-DD')])].sort() })} />
          )}
        </Space>
      </div>
    </Card>
  )
}

function MembersCard({ projectId }: { projectId: string }) {
  const repo = useProject((s) => s.repo)!
  const readOnly = useProject((s) => s.readOnly)
  const { message } = App.useApp()
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('nha_thau')

  const load = useCallback(async () => {
    try {
      setMembers((await repo.listMembers?.(projectId)) ?? [])
    } catch (e) {
      message.error((e as Error).message)
    }
  }, [repo, projectId, message])
  useEffect(() => void load(), [load])

  const roleOptions = (Object.keys(ROLE_LABEL) as MemberRole[]).map((k) => ({ value: k, label: ROLE_LABEL[k] }))
  return (
    <Card size="small" title="Thành viên và phân quyền" style={{ marginTop: 12 }}>
      {!readOnly && (
        <Space wrap style={{ marginBottom: 8 }}>
          <Input placeholder="Email (người đó cần đăng ký trước)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 260 }} />
          <Select value={role} onChange={setRole} options={roleOptions} style={{ width: 230 }} />
          <Button type="primary" disabled={!email} onClick={async () => {
            try {
              await repo.addMember!(projectId, email.trim(), role)
              setEmail('')
              await load()
            } catch (e) {
              message.error((e as Error).message)
            }
          }}>Thêm</Button>
        </Space>
      )}
      <Table size="small" rowKey="userId" pagination={false} dataSource={members}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Vai trò', dataIndex: 'role', width: 250, render: (r: MemberRole, m) => readOnly ? ROLE_LABEL[r] : (
            <Select size="small" value={r} options={roleOptions} style={{ width: 230 }} onChange={async (nr) => {
              try {
                await repo.addMember!(projectId, m.email, nr)
                await load()
              } catch (e) {
                message.error((e as Error).message)
              }
            }} />
          ) },
          ...(readOnly ? [] : [{ width: 40, render: (_: unknown, m: Member) => (
            <Popconfirm title="Bỏ thành viên này khỏi dự án?" onConfirm={async () => { await repo.removeMember!(projectId, m.userId); await load() }}>
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) }]),
        ]} />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        Quản trị và Chủ nhiệm dự án được sửa tiến độ. Chủ đầu tư, Tư vấn chỉ xem. Nhà thầu xem và cập nhật % hoàn thành.
      </Typography.Paragraph>
    </Card>
  )
}
