import { App, Button, Card, Form, Input, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { supabase } from '../data/supabaseRepo'

export default function LoginPage() {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok?: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) message.error(error.message)
    else if (ok) message.success(ok)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: 380, maxWidth: '100%' }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>Quản lý tiến độ thi công</Typography.Title>
        <Tabs
          items={[
            {
              key: 'in',
              label: 'Đăng nhập',
              children: (
                <Form layout="vertical" onFinish={(v) => run(() => supabase!.auth.signInWithPassword(v))}>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input autoComplete="email" /></Form.Item>
                  <Form.Item name="password" label="Mật khẩu" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
                  <Button type="primary" htmlType="submit" block loading={busy}>Đăng nhập</Button>
                </Form>
              ),
            },
            {
              key: 'up',
              label: 'Đăng ký',
              children: (
                <Form layout="vertical" onFinish={(v) => run(() => supabase!.auth.signUp(v), 'Đã tạo tài khoản. Kiểm tra email để xác nhận nếu được yêu cầu.')}>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input autoComplete="email" /></Form.Item>
                  <Form.Item name="password" label="Mật khẩu (ít nhất 6 ký tự)" rules={[{ required: true, min: 6 }]}><Input.Password autoComplete="new-password" /></Form.Item>
                  <Button type="primary" htmlType="submit" block loading={busy}>Đăng ký</Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
