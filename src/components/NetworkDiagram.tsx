import { DownloadOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
import { Button, Checkbox, Empty, Radio, Space, Typography } from 'antd'
import { useMemo, useRef, useState } from 'react'
import type { LinkType } from '../core/types'
import { downloadText, fmtDate, safeFileName } from '../lib/format'
import { useDerived } from '../store/useSchedule'

// Sơ đồ mạng công việc trên nút (AON). Mỗi nút: ES | D | EF ở trên, LS | TF | LF ở dưới.

const W = 184
const H = 84
const COL_GAP = 64
const ROW_GAP = 22
const PAD = 20
const r2 = (x: number) => Math.round(x * 100) / 100

interface Edge { from: string; to: string; type: LinkType; lag: number }

export default function NetworkDiagram() {
  const { data, sched, rowOf } = useDerived()!
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState<'days' | 'dates'>('days')
  const [onlyCritical, setOnlyCritical] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const layout = useMemo(() => {
    const tree = sched.tree
    let nodes = tree.ordered.filter((t) => !tree.isSummary(t.id)).map((t) => t.id)
    if (onlyCritical) nodes = nodes.filter((id) => sched.tasks.get(id)!.critical)
    const inSet = new Set(nodes)
    const edges: Edge[] = []
    const seen = new Set<string>()
    for (const l of data.links) {
      for (const a of tree.leavesOf(l.predecessorId))
        for (const b of tree.leavesOf(l.successorId)) {
          const k = `${a}|${b}`
          if (a === b || seen.has(k) || !inSet.has(a) || !inSet.has(b)) continue
          seen.add(k)
          edges.push({ from: a, to: b, type: l.type, lag: l.lag })
        }
    }
    const preds = new Map<string, string[]>(nodes.map((n) => [n, []]))
    for (const e of edges) preds.get(e.to)!.push(e.from)
    // cột = số bước dài nhất từ đầu sơ đồ
    const rank = new Map<string, number>()
    const rankOf = (n: string, guard = 0): number => {
      if (rank.has(n)) return rank.get(n)!
      if (guard > nodes.length) return 0
      const p = preds.get(n)!
      const r = p.length ? Math.max(...p.map((x) => rankOf(x, guard + 1))) + 1 : 0
      rank.set(n, r)
      return r
    }
    nodes.forEach((n) => rankOf(n))
    const cols: string[][] = []
    for (const n of nodes) (cols[rank.get(n)!] ??= []).push(n)
    // sắp thứ tự trong cột theo vị trí trung bình của việc trước để giảm giao cắt
    const yIdx = new Map<string, number>()
    cols.forEach((col, ci) => {
      if (ci > 0) {
        const bary = (n: string) => {
          const p = preds.get(n)!.filter((x) => yIdx.has(x))
          return p.length ? p.reduce((s, x) => s + yIdx.get(x)!, 0) / p.length : rowOf.get(n)! / 1000
        }
        col.sort((a, b) => bary(a) - bary(b) || rowOf.get(a)! - rowOf.get(b)!)
      }
      col.forEach((n, i) => yIdx.set(n, i))
    })
    const pos = new Map<string, { x: number; y: number }>()
    cols.forEach((col, ci) => col.forEach((n, i) => pos.set(n, { x: PAD + ci * (W + COL_GAP), y: PAD + i * (H + ROW_GAP) })))
    const width = PAD * 2 + Math.max(1, cols.length) * (W + COL_GAP) - COL_GAP
    const height = PAD * 2 + Math.max(1, ...cols.map((c) => c.length)) * (H + ROW_GAP) - ROW_GAP
    return { nodes, edges, pos, width, height }
  }, [data.links, sched, rowOf, onlyCritical])

  if (!layout.nodes.length) return <Empty description="Chưa có công việc" />

  const v = (id: string, k: 'es' | 'ef' | 'ls' | 'lf') => {
    const s = sched.tasks.get(id)!
    if (mode === 'days') return String(r2(s[k]))
    return fmtDate(k === 'es' ? s.start : k === 'ef' ? s.finish : k === 'ls' ? s.lateStart : s.lateFinish).slice(0, 5)
  }

  const exportSvg = () => {
    if (!svgRef.current) return
    const xml = new XMLSerializer().serializeToString(svgRef.current)
    downloadText(`${safeFileName(data.project.name)}-so-do-mang.svg`, xml, 'image/svg+xml')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="toolbar no-print">
        <Space.Compact>
          <Button icon={<ZoomOutOutlined />} onClick={() => setScale((s) => Math.max(0.3, s - 0.1))} />
          <Button onClick={() => setScale(1)}>{Math.round(scale * 100)}%</Button>
          <Button icon={<ZoomInOutlined />} onClick={() => setScale((s) => Math.min(2, s + 0.1))} />
        </Space.Compact>
        <Radio.Group size="small" optionType="button" value={mode} onChange={(e) => setMode(e.target.value)}
          options={[{ value: 'days', label: 'Ngày thứ' }, { value: 'dates', label: 'Ngày lịch' }]} />
        <Checkbox checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)}>Chỉ đường găng</Checkbox>
        <Button icon={<DownloadOutlined />} onClick={exportSvg}>Tải SVG</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Ô trên: ES | D | EF · ô dưới: LS | TF | LF · viền đỏ là công việc găng</Typography.Text>
      </div>
      <div className="net-wrap">
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={layout.width * scale} height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ fontFamily: 'Segoe UI, Roboto, Arial, sans-serif', background: '#fff' }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b7280" /></marker>
            <marker id="arrc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e5484d" /></marker>
          </defs>
          {layout.edges.map((e, i) => {
            const a = layout.pos.get(e.from)!
            const b = layout.pos.get(e.to)!
            const fromStart = e.type === 'SS' || e.type === 'SF'
            const toFinish = e.type === 'FF' || e.type === 'SF'
            const x1 = fromStart ? a.x : a.x + W
            const y1 = a.y + H / 2
            const x2 = toFinish ? b.x + W : b.x
            const y2 = b.y + H / 2
            const sa = sched.tasks.get(e.from)!
            const sb = sched.tasks.get(e.to)!
            const crit = sa.critical && sb.critical && Math.abs(sa.ef + (e.type === 'FS' ? e.lag : 0) - sb.es) < 1e-6
            const dx = Math.max(30, Math.abs(x2 - x1) / 2)
            const c1 = fromStart ? x1 - dx : x1 + dx
            const c2 = toFinish ? x2 + dx : x2 - dx
            const label = e.type !== 'FS' || e.lag ? `${e.type}${e.lag ? (e.lag > 0 ? '+' : '') + e.lag : ''}` : ''
            return (
              <g key={i}>
                <path d={`M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`} fill="none" stroke={crit ? '#e5484d' : '#9ca3af'} strokeWidth={crit ? 2 : 1.2} markerEnd={`url(#${crit ? 'arrc' : 'arr'})`} />
                {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize={10} textAnchor="middle" fill="#374151">{label}</text>}
              </g>
            )
          })}
          {layout.nodes.map((id) => {
            const p = layout.pos.get(id)!
            const s = sched.tasks.get(id)!
            const t = sched.tree.byId.get(id)!
            const stroke = s.complete ? '#52a447' : s.critical ? '#e5484d' : '#6b7280'
            const cw = W / 3
            const name = `${rowOf.get(id)}. ${t.name}`
            const lines = wrap(name, 26, 2)
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`}>
                <title>{`${s.wbs} ${t.name}\n${fmtDate(s.start)} → ${fmtDate(s.finish)}`}</title>
                <rect width={W} height={H} rx={4} fill={s.complete ? '#f0fdf4' : '#fff'} stroke={stroke} strokeWidth={s.critical ? 2 : 1.2} />
                <line x1={0} y1={22} x2={W} y2={22} stroke={stroke} strokeWidth={0.8} />
                <line x1={0} y1={H - 22} x2={W} y2={H - 22} stroke={stroke} strokeWidth={0.8} />
                {[1, 2].map((k) => (
                  <g key={k}>
                    <line x1={cw * k} y1={0} x2={cw * k} y2={22} stroke={stroke} strokeWidth={0.8} />
                    <line x1={cw * k} y1={H - 22} x2={cw * k} y2={H} stroke={stroke} strokeWidth={0.8} />
                  </g>
                ))}
                <g fontSize={11} textAnchor="middle" fill="#111827">
                  <text x={cw / 2} y={15}>{v(id, 'es')}</text>
                  <text x={cw * 1.5} y={15} fontWeight={600}>{r2(t.duration)}</text>
                  <text x={cw * 2.5} y={15}>{v(id, 'ef')}</text>
                  <text x={cw / 2} y={H - 7}>{v(id, 'ls')}</text>
                  <text x={cw * 1.5} y={H - 7} fill={s.tf <= 0 ? '#c4373c' : '#111827'} fontWeight={600}>{r2(s.tf)}</text>
                  <text x={cw * 2.5} y={H - 7}>{v(id, 'lf')}</text>
                </g>
                {lines.map((ln, i) => (
                  <text key={i} x={W / 2} y={lines.length === 1 ? 46 : 39 + i * 14} fontSize={11.5} textAnchor="middle" fill="#111827">{ln}</text>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function wrap(s: string, max: number, maxLines: number): string[] {
  const words = s.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur)
      cur = w
    } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const out = lines.slice(0, maxLines)
    out[maxLines - 1] = out[maxLines - 1].slice(0, max - 1) + '…'
    return out
  }
  return lines
}
