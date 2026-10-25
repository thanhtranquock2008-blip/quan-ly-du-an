import { CopyOutlined, DeleteOutlined, DownloadOutlined, DownOutlined, ImportOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { App, Button, Card, Dropdown, Empty, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { importMspdi } from '../core/mspdi'
import type { ProjectData, ProjectStatus } from '../core/types'
import { ROLE_LABEL, type ProjectSummary } from '../data/repo'
import NewProjectModal from '../components/NewProjectModal'
import { downloadText, fmtDate, fmtDateTime, pickFile, safeFileName } from '../lib/format'
import { cloneWithNewIds, validateBackup } from '../lib/reid'
import { sampleNhaPho, sampleViDu7A } from '../lib/samples'
import { useProject } from '../store/projectStore'

export const STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  chuan_bi: { label: 'Chuẩn bị', color: 'blue' },
  thuc_hien: { label: 'Thực hiện', color: 'green' },
  tam_dung: { label: 'Tạm dừng', color: 'orange' },
  ket_thuc: { label: 'Kết thúc', color: 'default' },
}

export default function ProjectList() {
  const repo = useProject((s) => s.repo)!
  const { message, modal } = App.useApp()
  const nav = useNavigate()
  const [list, setList] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setList(await repo.listProjects())
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repo, message])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveAndOpen = async (d: ProjectData) => {
    try {
      await repo.saveProject(d)
      nav(`/p/${d.project.id}`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const importXml = async () => {
    const f = await pickFile('.xml')
    if (!f) return
    try {
      const { data, warnings } = importMspdi(await f.text())
      if (!data.project.name || data.project.name === 'Dự án nhập từ MS Project') data.project.name = f.name.replace(/\.xml$/i, '')
      if (warnings.length)
        modal.warning({ title: 'Đã nhập, có một số điểm cần kiểm tra', content: <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> })
      await saveAndOpen(data)
    } catch (e) {
      message.error(`Không đọc được tệp: ${(e as Error).message}`)
    }
  }

  const restore = async () => {
    const f = await pickFile('.json')
    if (!f) return
    try {
      const d = cloneWithNewIds(validateBackup(JSON.parse(await f.text())))
      await saveAndOpen(d)
      message.success('Đã khôi phục thành một dự án mới')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const backup = async (id: string) => {
    const d = await repo.loadProject(id)
    downloadText(`${safeFileName(d.project.name)}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 1))
  }

  const duplicate = async (id: string) => {
    const d = await repo.loadProject(id)
    await repo.saveProject(cloneWithNewIds(d, `${d.project.name} (bản sao)`))
    await reload()
  }

  const remove = async (id: string) => {
    try {
      await repo.deleteProject(id)
      await reload()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div className="page">
      <Card
        title="Dự án"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Tạo dự án</Button>
            <Button icon={<ImportOutlined />} onClick={importXml}>Nhập MS Project (XML)</Button>
            <Button icon={<UploadOutlined />} onClick={restore}>Khôi phục sao lưu</Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'np', label: 'Nhà phố 3 tầng (WBS, nguồn lực, chi phí)' },
                  { key: '7a', label: 'Ví dụ 7A (bài tập MS Project trên lớp)' },
                ],
                onClick: ({ key }) => void saveAndOpen(key === 'np' ? sampleNhaPho() : sampleViDu7A()),
              }}
            >
              <Button>Dự án mẫu <DownOutlined /></Button>
            </Dropdown>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          pagination={false}
          scroll={{ x: 800 }}
          locale={{ emptyText: <Empty description="Chưa có dự án. Tạo mới, nhập tệp MS Project hoặc mở một dự án mẫu." /> }}
          columns={[
            { title: 'Mã', dataIndex: 'code', width: 90 },
            { title: 'Tên dự án', dataIndex: 'name', render: (v, r) => <Link to={`/p/${r.id}`}>{v}</Link> },
            { title: 'Chủ đầu tư', dataIndex: 'owner', responsive: ['md'] },
            { title: 'Khởi công', dataIndex: 'start', width: 110, render: fmtDate },
            { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (s: ProjectStatus) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.label ?? s}</Tag> },
            ...(repo.kind === 'supabase' ? [{ title: 'Vai trò của bạn', dataIndex: 'myRole', width: 170, render: (r: keyof typeof ROLE_LABEL) => ROLE_LABEL[r] }] : []),
            { title: 'Sửa lần cuối', dataIndex: 'updatedAt', width: 150, responsive: ['lg'], render: fmtDateTime },
            {
              title: '',
              width: 130,
              render: (_, r) => (
                <Space size={0}>
                  <Button type="text" icon={<DownloadOutlined />} title="Xuất sao lưu (JSON)" onClick={() => backup(r.id)} />
                  <Button type="text" icon={<CopyOutlined />} title="Nhân bản" onClick={() => duplicate(r.id)} />
                  <Popconfirm title="Xóa dự án này?" description="Không thể hoàn tác." okText="Xóa" okButtonProps={{ danger: true }} onConfirm={() => remove(r.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} title="Xóa" />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        {repo.kind === 'local' && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Đang chạy ở chế độ lưu trên máy: dữ liệu nằm trong trình duyệt này. Hãy xuất sao lưu thường xuyên. Muốn nhiều người cùng dùng, cấu hình Supabase theo hướng dẫn trong README.
          </Typography.Paragraph>
        )}
      </Card>
      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreate={saveAndOpen} />
    </div>
  )
}
