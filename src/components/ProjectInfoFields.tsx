import { Col, DatePicker, Form, Input, InputNumber, Row, Select } from 'antd'
import type { ProjectStatus } from '../core/types'
import { DATETIME_FMT } from '../lib/format'

export const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'chuan_bi', label: 'Chuẩn bị' },
  { value: 'thuc_hien', label: 'Thực hiện' },
  { value: 'tam_dung', label: 'Tạm dừng' },
  { value: 'ket_thuc', label: 'Kết thúc' },
]

export const vndFormatter = (v?: string | number) => (v === undefined || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
export const vndParser = (v?: string) => Number((v ?? '').replace(/\./g, '').replace(',', '.')) || 0

/** Các trường thông tin dự án (DA-01, DA-03) dùng trong Form của Ant Design */
export default function ProjectInfoFields() {
  return (
    <Row gutter={12}>
      <Col xs={24} md={16}>
        <Form.Item name="name" label="Tên dự án" rules={[{ required: true, message: 'Nhập tên dự án' }]}><Input /></Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="code" label="Mã dự án"><Input /></Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="owner" label="Chủ đầu tư"><Input /></Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="manager" label="Chủ nhiệm dự án / Chỉ huy trưởng"><Input /></Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="location" label="Địa điểm"><Input /></Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="start" label="Ngày giờ khởi công" rules={[{ required: true }]}>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format={DATETIME_FMT} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="budget" label="Ngân sách (₫)">
          <InputNumber min={0} style={{ width: '100%' }} formatter={vndFormatter} parser={vndParser} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="status" label="Trạng thái"><Select options={STATUS_OPTIONS} /></Form.Item>
      </Col>
    </Row>
  )
}
