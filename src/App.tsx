import { CloudOutlined, DesktopOutlined, LogoutOutlined } from '@ant-design/icons'
import type { Session } from '@supabase/supabase-js'
import { Button, Spin, Tag, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { LocalRepo } from './data/localRepo'
import { supabase, SupabaseRepo } from './data/supabaseRepo'
import LoginPage from './pages/LoginPage'
import ProjectList from './pages/ProjectList'
import ProjectPage from './pages/ProjectPage'
import { useProject } from './store/projectStore'

export default function App() {
  const setRepo = useProject((s) => s.setRepo)
  const repo = useProject((s) => s.repo)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) {
      setRepo(new LocalRepo())
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [setRepo])

  useEffect(() => {
    if (supabase && session) setRepo(new SupabaseRepo(supabase))
  }, [session, setRepo])

  if (!authReady) return <Spin fullscreen />
  if (supabase && !session) return <LoginPage />
  if (!repo) return <Spin fullscreen />

  return (
    <>
      <header className="app-header no-print">
        <Link to="/" className="app-title">Quản lý tiến độ thi công</Link>
        <span style={{ flex: 1 }} />
        {repo.kind === 'local' ? (
          <Tooltip title="Dữ liệu lưu trong trình duyệt của máy này. Nhớ xuất sao lưu định kỳ.">
            <Tag icon={<DesktopOutlined />} color="gold">Lưu trên máy</Tag>
          </Tooltip>
        ) : (
          <Tag icon={<CloudOutlined />} color="green">Trực tuyến</Tag>
        )}
        {session && (
          <>
            <span style={{ fontSize: 13 }}>{session.user.email}</span>
            <Button size="small" icon={<LogoutOutlined />} onClick={() => supabase!.auth.signOut()}>Đăng xuất</Button>
          </>
        )}
      </header>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/p/:id/:tab?" element={<ProjectPage />} />
      </Routes>
    </>
  )
}
