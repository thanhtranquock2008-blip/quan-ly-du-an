import { App as AntApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

dayjs.locale('vi')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={viVN} theme={{ token: { colorPrimary: '#1f5fa8', borderRadius: 6 } }}>
      <AntApp>
        <HashRouter>
          <App />
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
