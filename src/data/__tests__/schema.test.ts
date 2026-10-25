// @vitest-environment happy-dom
// Chạy lược đồ Supabase trên PostgreSQL nhúng (PGlite) để kiểm tra RPC và RLS.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { importMspdi } from '../../core/mspdi'
import type { ProjectData } from '../../core/types'

const root = join(__dirname, '../../..')
const migration = readFileSync(join(root, 'supabase/migrations/20261025000000_init.sql'), 'utf-8')
const xml = readFileSync(join(root, 'src/samples/vi-du-7a.xml'), 'utf-8')

const U1 = '11111111-1111-1111-1111-111111111111' // chủ nhiệm
const U2 = '22222222-2222-2222-2222-222222222222' // nhà thầu
const U3 = '33333333-3333-3333-3333-333333333333' // người ngoài

let db: PGlite

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

const rpc = async (sql: string, params: unknown[] = []) => (await db.query<{ r: unknown }>(sql, params)).rows[0]?.r

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    insert into auth.users values ('${U1}', 'chunhiem@congty.vn'), ('${U2}', 'nhathau@congty.vn'), ('${U3}', 'nguoingoai@congty.vn');
  `)
  await db.exec(migration)
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public, auth to authenticated;
  `)
}, 60_000)

describe('Lược đồ Supabase', () => {
  let data: ProjectData

  it('lưu và đọc lại dự án 7A qua save_project / get_project', async () => {
    data = importMspdi(xml).data
    await as(U1, () => db.query('select public.save_project($1)', [JSON.stringify(data)]))
    const back = (await as(U1, () => rpc('select public.get_project($1) as r', [data.project.id]))) as ProjectData & { myRole: string }
    expect(back.myRole).toBe('quan_tri')
    expect(back.project.start).toBe('2024-12-23T08:00')
    expect(back.project.calendar).toEqual(data.project.calendar)
    expect(back.tasks.map((t) => [t.name, Number(t.duration), t.parentId])).toEqual(data.tasks.map((t) => [t.name, t.duration, null]))
    expect(back.links).toHaveLength(data.links.length)
    expect(back.assignments).toHaveLength(data.assignments.length)
    expect(back.resources.map((r) => r.name).sort()).toEqual(data.resources.map((r) => r.name).sort())
  })

  it('lưu lần hai: xóa dòng bị xóa, không ghi nhật ký dòng không đổi', async () => {
    const before = Number((await db.query<{ n: number }>('select count(*) n from public.audit_log')).rows[0].n)
    const removed = data.tasks[3]
    const next: ProjectData = {
      ...data,
      tasks: data.tasks.filter((t) => t.id !== removed.id),
      links: data.links.filter((l) => l.predecessorId !== removed.id && l.successorId !== removed.id),
      assignments: data.assignments.filter((a) => a.taskId !== removed.id),
    }
    await as(U1, () => db.query('select public.save_project($1)', [JSON.stringify(next)]))
    const back = (await as(U1, () => rpc('select public.get_project($1) as r', [data.project.id]))) as ProjectData
    expect(back.tasks).toHaveLength(data.tasks.length - 1)
    const log = await db.query<{ table_name: string; action: string }>('select table_name, action from public.audit_log where id > $1 order by id', [before])
    // chỉ có: cập nhật dự án + xóa 1 việc, 2 liên kết, 1 phân bổ nguồn lực
    expect(log.rows.filter((r) => r.action === 'update' && r.table_name !== 'projects')).toEqual([])
    expect(log.rows.filter((r) => r.action === 'delete').map((r) => r.table_name).sort()).toEqual(['assignments', 'links', 'links', 'tasks'])
  })

  it('người ngoài dự án không xem và không sửa được', async () => {
    const list = await as(U3, () => rpc('select public.list_projects() as r'))
    expect(list).toEqual([])
    await expect(as(U3, () => db.query('select public.get_project($1)', [data.project.id]))).rejects.toThrow(/Không tìm thấy/)
    await expect(as(U3, () => db.query('select public.save_project($1)', [JSON.stringify(data)]))).rejects.toThrow()
  })

  it('nhà thầu xem được, chỉ cập nhật được tiến độ', async () => {
    await as(U1, () => db.query(`select public.add_member($1, 'NhaThau@congty.vn', 'nha_thau')`, [data.project.id]))
    const members = await as(U1, () => db.query<{ email: string; role: string }>('select email, role from public.list_members($1)', [data.project.id]))
    expect(members.rows).toEqual([{ email: 'chunhiem@congty.vn', role: 'quan_tri' }, { email: 'nhathau@congty.vn', role: 'nha_thau' }])

    const list = (await as(U2, () => rpc('select public.list_projects() as r'))) as { myRole: string }[]
    expect(list.map((p) => p.myRole)).toEqual(['nha_thau'])
    await expect(as(U2, () => db.query('select public.save_project($1)', [JSON.stringify(data)]))).rejects.toThrow()
    await expect(as(U2, () => db.query('update public.tasks set name = $1 where id = $2', ['x', data.tasks[1].id])).then((r) => r.affectedRows)).resolves.toBe(0)

    await as(U2, () => db.query(`select public.update_task_progress($1, 50, '2024-12-23 08:00', null)`, [data.tasks[1].id]))
    const back = (await as(U1, () => rpc('select public.get_project($1) as r', [data.project.id]))) as ProjectData
    expect(Number(back.tasks.find((t) => t.id === data.tasks[1].id)!.percentComplete)).toBe(50)
    const who = await db.query<{ changed_by: string }>(`select changed_by from public.audit_log where table_name = 'tasks' order by id desc limit 1`)
    expect(who.rows[0].changed_by).toBe(U2)
  })

  it('chỉ quản trị dự án được xóa dự án', async () => {
    await as(U2, () => db.query('delete from public.projects where id = $1', [data.project.id]))
    expect(((await as(U1, () => rpc('select public.list_projects() as r'))) as unknown[]).length).toBe(1)
    await as(U1, () => db.query('delete from public.projects where id = $1', [data.project.id]))
    expect(await as(U1, () => rpc('select public.list_projects() as r'))).toEqual([])
  })
})
