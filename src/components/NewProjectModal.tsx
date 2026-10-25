import { Form, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ProjectData } from '../core/types'
import { emptyProject } from '../lib/samples'
import ProjectInfoFields from './ProjectInfoFields'

interface Props {
  open: boolean
  onClose(): void
  onCreate(d: ProjectData): void
}

export default function NewProjectModal({ open, onClose, onCreate }: Props) {
  const [form] = Form.useForm()
  return (
    <Modal
      title="Tạo dự án"
      open={open}
      onCancel={onClose}
      okText="Tạo"
      width={720}
      destroyOnHidden
      onOk={async () => {
        const v = await form.validateFields()
        const start = (v.start as Dayjs).format('YYYY-MM-DDTHH:mm')
        const { start: _s, ...rest } = v
        void _s
        onCreate(emptyProject(v.name, start, rest))
        onClose()
      }}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ status: 'chuan_bi', start: dayjs().add(1, 'day').hour(7).minute(30).second(0) }}
      >
        <ProjectInfoFields />
      </Form>
    </Modal>
  )
}
