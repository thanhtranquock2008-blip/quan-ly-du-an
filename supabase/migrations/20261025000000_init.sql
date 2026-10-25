-- Lược đồ cơ sở dữ liệu cho chương trình quản lý tiến độ thi công (Supabase / PostgreSQL)
-- Phân quyền theo từng dự án bằng Row Level Security (RLS).

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('quan_tri', 'chu_dau_tu', 'chu_nhiem', 'tu_van', 'nha_thau');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null,
  owner_name text,             -- chủ đầu tư
  location text,
  manager text,                -- chủ nhiệm dự án
  budget numeric,
  status text not null default 'chuan_bi'
    check (status in ('chuan_bi', 'thuc_hien', 'tam_dung', 'ket_thuc')),
  start_at timestamp not null,
  status_date date,
  reschedule_after_status boolean not null default true,
  calendar jsonb not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  primary key (project_id, user_id)
);

create table public.tasks (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.tasks (id) on delete cascade deferrable initially deferred,
  sort_order integer not null default 0,
  name text not null default '',
  duration numeric not null default 1 check (duration >= 0),
  unit text,
  quantity numeric,
  responsible text,
  notes text,
  constraint_type text not null default 'ASAP' check (constraint_type in ('ASAP', 'SNET', 'FNET', 'MSO')),
  constraint_date timestamp,
  percent_complete numeric not null default 0 check (percent_complete between 0 and 100),
  actual_start timestamp,
  actual_finish timestamp,
  fixed_cost numeric,
  updated_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);

create table public.links (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  predecessor_id uuid not null references public.tasks (id) on delete cascade deferrable initially deferred,
  successor_id uuid not null references public.tasks (id) on delete cascade deferrable initially deferred,
  type text not null default 'FS' check (type in ('FS', 'SS', 'FF', 'SF')),
  lag numeric not null default 0,
  check (predecessor_id <> successor_id)
);
create index links_project_idx on public.links (project_id);

create table public.resources (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type text not null check (type in ('work', 'material', 'cost')),
  unit text,
  rate numeric not null default 0,
  cost_per_use numeric not null default 0,
  grp text,
  is_equipment boolean not null default false
);
create index resources_project_idx on public.resources (project_id);

create table public.assignments (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade deferrable initially deferred,
  resource_id uuid not null references public.resources (id) on delete cascade deferrable initially deferred,
  units numeric not null default 1
);
create index assignments_project_idx on public.assignments (project_id);

create table public.baselines (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  entries jsonb not null default '[]'
);

-- Nhật ký thay đổi: ai sửa gì, lúc nào
create table public.audit_log (
  id bigserial primary key,
  project_id uuid not null,
  table_name text not null,
  row_id uuid,
  action text not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);
create index audit_log_project_idx on public.audit_log (project_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Hàm phân quyền
-- ---------------------------------------------------------------------------

create function public.project_role(p uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid()
$$;

create function public.can_view(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.project_role(p) is not null
$$;

create function public.can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.project_role(p) in ('quan_tri', 'chu_nhiem'), false)
$$;

-- Người tạo dự án tự thành quản trị dự án
create function public.add_creator_as_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, new.created_by, 'quan_tri')
  on conflict do nothing;
  return new;
end $$;
create trigger projects_add_creator after insert on public.projects
  for each row execute function public.add_creator_as_admin();

create function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (project_id, table_name, row_id, action, old_row, new_row)
  values (
    case when tg_table_name = 'projects' then (r ->> 'id')::uuid else (r ->> 'project_id')::uuid end,
    tg_table_name, (r ->> 'id')::uuid, lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_projects after insert or update on public.projects for each row execute function public.write_audit();
create trigger audit_tasks after insert or update or delete on public.tasks for each row execute function public.write_audit();
create trigger audit_links after insert or update or delete on public.links for each row execute function public.write_audit();
create trigger audit_resources after insert or update or delete on public.resources for each row execute function public.write_audit();
create trigger audit_assignments after insert or update or delete on public.assignments for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.links enable row level security;
alter table public.resources enable row level security;
alter table public.assignments enable row level security;
alter table public.baselines enable row level security;
alter table public.audit_log enable row level security;

create policy projects_select on public.projects for select using (public.can_view(id));
create policy projects_insert on public.projects for insert with check (created_by = auth.uid());
create policy projects_update on public.projects for update using (public.can_edit(id));
create policy projects_delete on public.projects for delete using (public.project_role(id) = 'quan_tri');

create policy members_select on public.project_members for select using (public.can_view(project_id));
create policy members_write on public.project_members for all
  using (public.project_role(project_id) in ('quan_tri', 'chu_nhiem'))
  with check (public.project_role(project_id) in ('quan_tri', 'chu_nhiem'));

do $$
declare t text;
begin
  foreach t in array array['tasks', 'links', 'resources', 'assignments', 'baselines'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.can_view(project_id))', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.can_edit(project_id)) with check (public.can_edit(project_id))', t);
  end loop;
end $$;

create policy audit_select on public.audit_log for select using (public.can_view(project_id));

-- ---------------------------------------------------------------------------
-- Hàm gọi từ ứng dụng (RPC)
-- ---------------------------------------------------------------------------

-- Dự án dạng JSON (tên trường như trong ứng dụng)
create function public.project_json(p public.projects) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name, 'owner', p.owner_name, 'location', p.location,
    'manager', p.manager, 'budget', p.budget, 'status', p.status,
    'start', to_char(p.start_at, 'YYYY-MM-DD"T"HH24:MI'),
    'statusDate', to_char(p.status_date, 'YYYY-MM-DD'),
    'rescheduleAfterStatus', p.reschedule_after_status,
    'calendar', p.calendar,
    'createdAt', p.created_at, 'updatedAt', p.updated_at))
$$;

-- Danh sách dự án người dùng được xem, kèm vai trò
create function public.list_projects() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(public.project_json(p) || jsonb_build_object('myRole', public.project_role(p.id)) order by p.updated_at desc), '[]')
  from public.projects p
$$;

create function public.get_project(pid uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  p public.projects;
  fmt constant text := 'YYYY-MM-DD"T"HH24:MI';
begin
  select * into p from public.projects where id = pid;
  if not found then
    raise exception 'Không tìm thấy dự án hoặc bạn không có quyền xem' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'project', public.project_json(p),
    'myRole', public.project_role(pid),
    'tasks', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', t.id, 'parentId', t.parent_id, 'order', t.sort_order, 'name', t.name, 'duration', t.duration,
        'unit', t.unit, 'quantity', t.quantity, 'responsible', t.responsible, 'notes', t.notes,
        'constraint', t.constraint_type, 'constraintDate', to_char(t.constraint_date, fmt),
        'percentComplete', t.percent_complete,
        'actualStart', to_char(t.actual_start, fmt), 'actualFinish', to_char(t.actual_finish, fmt),
        'fixedCost', t.fixed_cost)) || jsonb_build_object('parentId', t.parent_id) order by t.sort_order)
      from public.tasks t where t.project_id = pid), '[]'),
    'links', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'predecessorId', l.predecessor_id, 'successorId', l.successor_id, 'type', l.type, 'lag', l.lag))
      from public.links l where l.project_id = pid), '[]'),
    'resources', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', r.id, 'name', r.name, 'type', r.type, 'unit', r.unit, 'rate', r.rate, 'costPerUse', r.cost_per_use,
        'group', r.grp, 'isEquipment', r.is_equipment)) order by r.name)
      from public.resources r where r.project_id = pid), '[]'),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'taskId', a.task_id, 'resourceId', a.resource_id, 'units', a.units))
      from public.assignments a where a.project_id = pid), '[]'),
    'baselines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'createdAt', b.created_at, 'entries', b.entries) order by b.created_at)
      from public.baselines b where b.project_id = pid), '[]')
  );
end $$;

-- Lưu toàn bộ dự án trong một giao dịch: thêm/sửa dòng có trong dữ liệu, xóa dòng không còn.
-- Chạy với quyền của người gọi nên RLS vẫn áp dụng.
create function public.save_project(payload jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  pj jsonb := payload -> 'project';
  pid uuid := (pj ->> 'id')::uuid;
begin
  -- tách thêm mới / cập nhật: dự án mới chưa có thành viên nên chưa qua được chính sách SELECT
  if exists (select 1 from public.projects where id = pid) then
    update public.projects set
      code = coalesce(pj ->> 'code', ''), name = pj ->> 'name', owner_name = pj ->> 'owner',
      location = pj ->> 'location', manager = pj ->> 'manager', budget = (pj ->> 'budget')::numeric,
      status = coalesce(pj ->> 'status', 'chuan_bi'), start_at = (pj ->> 'start')::timestamp,
      status_date = (pj ->> 'statusDate')::date,
      reschedule_after_status = coalesce((pj ->> 'rescheduleAfterStatus')::boolean, true),
      calendar = pj -> 'calendar', updated_at = now()
    where id = pid;
  else
    insert into public.projects (id, code, name, owner_name, location, manager, budget, status, start_at,
      status_date, reschedule_after_status, calendar)
    values (pid, coalesce(pj ->> 'code', ''), pj ->> 'name', pj ->> 'owner', pj ->> 'location', pj ->> 'manager',
      (pj ->> 'budget')::numeric, coalesce(pj ->> 'status', 'chuan_bi'), (pj ->> 'start')::timestamp,
      (pj ->> 'statusDate')::date, coalesce((pj ->> 'rescheduleAfterStatus')::boolean, true), pj -> 'calendar');
  end if;

  if not public.can_edit(pid) then
    raise exception 'Bạn không có quyền sửa dự án này' using errcode = '42501';
  end if;

  -- xóa những dòng đã bị xóa trên ứng dụng
  delete from public.assignments where project_id = pid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(payload -> 'assignments') e);
  delete from public.links where project_id = pid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(payload -> 'links') e);
  delete from public.tasks where project_id = pid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(payload -> 'tasks') e);
  delete from public.resources where project_id = pid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(payload -> 'resources') e);
  delete from public.baselines where project_id = pid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(payload -> 'baselines') e);

  insert into public.tasks as x (id, project_id, parent_id, sort_order, name, duration, unit, quantity, responsible,
    notes, constraint_type, constraint_date, percent_complete, actual_start, actual_finish, fixed_cost)
  select r.id, pid, r."parentId", r."order", r.name, r.duration, r.unit, r.quantity, r.responsible, r.notes,
    coalesce(r."constraint", 'ASAP'), r."constraintDate", coalesce(r."percentComplete", 0), r."actualStart",
    r."actualFinish", r."fixedCost"
  from jsonb_to_recordset(payload -> 'tasks') as r(id uuid, "parentId" uuid, "order" int, name text, duration numeric,
    unit text, quantity numeric, responsible text, notes text, "constraint" text, "constraintDate" timestamp,
    "percentComplete" numeric, "actualStart" timestamp, "actualFinish" timestamp, "fixedCost" numeric)
  on conflict (id) do update set
    parent_id = excluded.parent_id, sort_order = excluded.sort_order, name = excluded.name, duration = excluded.duration,
    unit = excluded.unit, quantity = excluded.quantity, responsible = excluded.responsible, notes = excluded.notes,
    constraint_type = excluded.constraint_type, constraint_date = excluded.constraint_date,
    percent_complete = excluded.percent_complete, actual_start = excluded.actual_start,
    actual_finish = excluded.actual_finish, fixed_cost = excluded.fixed_cost, updated_at = now()
  where x.project_id = pid and (x.parent_id, x.sort_order, x.name, x.duration, x.unit, x.quantity, x.responsible, x.notes,
    x.constraint_type, x.constraint_date, x.percent_complete, x.actual_start, x.actual_finish, x.fixed_cost)
    is distinct from (excluded.parent_id, excluded.sort_order, excluded.name, excluded.duration, excluded.unit,
    excluded.quantity, excluded.responsible, excluded.notes, excluded.constraint_type, excluded.constraint_date,
    excluded.percent_complete, excluded.actual_start, excluded.actual_finish, excluded.fixed_cost);

  insert into public.resources as x (id, project_id, name, type, unit, rate, cost_per_use, grp, is_equipment)
  select r.id, pid, r.name, r.type, r.unit, coalesce(r.rate, 0), coalesce(r."costPerUse", 0), r."group",
    coalesce(r."isEquipment", false)
  from jsonb_to_recordset(payload -> 'resources') as r(id uuid, name text, type text, unit text, rate numeric,
    "costPerUse" numeric, "group" text, "isEquipment" boolean)
  on conflict (id) do update set name = excluded.name, type = excluded.type, unit = excluded.unit, rate = excluded.rate,
    cost_per_use = excluded.cost_per_use, grp = excluded.grp, is_equipment = excluded.is_equipment
  where x.project_id = pid and (x.name, x.type, x.unit, x.rate, x.cost_per_use, x.grp, x.is_equipment)
    is distinct from (excluded.name, excluded.type, excluded.unit, excluded.rate, excluded.cost_per_use, excluded.grp,
    excluded.is_equipment);

  insert into public.links as x (id, project_id, predecessor_id, successor_id, type, lag)
  select r.id, pid, r."predecessorId", r."successorId", coalesce(r.type, 'FS'), coalesce(r.lag, 0)
  from jsonb_to_recordset(payload -> 'links') as r(id uuid, "predecessorId" uuid, "successorId" uuid, type text, lag numeric)
  on conflict (id) do update set predecessor_id = excluded.predecessor_id, successor_id = excluded.successor_id,
    type = excluded.type, lag = excluded.lag
  where x.project_id = pid and (x.predecessor_id, x.successor_id, x.type, x.lag)
    is distinct from (excluded.predecessor_id, excluded.successor_id, excluded.type, excluded.lag);

  insert into public.assignments as x (id, project_id, task_id, resource_id, units)
  select r.id, pid, r."taskId", r."resourceId", coalesce(r.units, 1)
  from jsonb_to_recordset(payload -> 'assignments') as r(id uuid, "taskId" uuid, "resourceId" uuid, units numeric)
  on conflict (id) do update set task_id = excluded.task_id, resource_id = excluded.resource_id, units = excluded.units
  where x.project_id = pid and (x.task_id, x.resource_id, x.units)
    is distinct from (excluded.task_id, excluded.resource_id, excluded.units);

  insert into public.baselines as x (id, project_id, name, created_at, entries)
  select r.id, pid, r.name, coalesce(r."createdAt", now()), coalesce(r.entries, '[]')
  from jsonb_to_recordset(payload -> 'baselines') as r(id uuid, name text, "createdAt" timestamptz, entries jsonb)
  on conflict (id) do update set name = excluded.name, entries = excluded.entries
  where x.project_id = pid and (x.name, x.entries) is distinct from (excluded.name, excluded.entries);
end $$;

-- Nhà thầu / tổ trưởng chỉ được cập nhật tiến độ của công việc
create function public.update_task_progress(tid uuid, pct numeric, a_start timestamp, a_finish timestamp)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from public.tasks where id = tid;
  if pid is null or coalesce(public.project_role(pid) not in ('quan_tri', 'chu_nhiem', 'nha_thau'), true) then
    raise exception 'Bạn không có quyền cập nhật tiến độ công việc này' using errcode = '42501';
  end if;
  update public.tasks set percent_complete = pct, actual_start = a_start, actual_finish = a_finish, updated_at = now()
  where id = tid;
end $$;

-- Thành viên dự án
create function public.list_members(pid uuid) returns table (user_id uuid, email text, role public.member_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role from public.project_members m join auth.users u on u.id = m.user_id
  where m.project_id = pid and public.can_view(pid)
  order by u.email
$$;

create function public.add_member(pid uuid, member_email text, member_role public.member_role) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if coalesce(public.project_role(pid) not in ('quan_tri', 'chu_nhiem'), true) then
    raise exception 'Chỉ quản trị hoặc chủ nhiệm dự án được thêm thành viên' using errcode = '42501';
  end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then
    raise exception 'Chưa có tài khoản với email %. Người đó cần đăng ký trước.', member_email using errcode = 'P0002';
  end if;
  insert into public.project_members (project_id, user_id, role) values (pid, uid, member_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;
