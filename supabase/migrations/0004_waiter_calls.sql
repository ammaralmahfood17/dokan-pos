-- ============================================================================
-- DOKAN — "Call Waiter" from the public QR menu (P0.3)
-- ============================================================================

-- Customers call the waiter through a security-definer RPC (no anon writes
-- on the table itself). Staff read calls through RLS; new calls are pushed
-- to the dashboard/KDS via Supabase Realtime.
create table if not exists public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  type text not null default 'assistance' check (type in ('assistance', 'bill')),
  status text not null default 'pending' check (status in ('pending', 'acknowledged')),
  created_at timestamptz not null default now()
);

create index if not exists waiter_calls_table_created_idx
  on public.waiter_calls (table_id, created_at desc);

alter table public.waiter_calls enable row level security;

-- Staff can read calls for their own project (acknowledgement is a future
-- RPC; the table stays append-only from the client's perspective).
create policy "Staff can read waiter calls"
  on public.waiter_calls
  for select
  using (
    is_staff((select project_id from public.tables where id = table_id))
  );

-- Push new calls to the dashboard/KDS clients.
alter publication supabase_realtime add table public.waiter_calls;

-- Customer-facing RPC: validates the table, records the call, broadcasts.
create or replace function public.call_waiter(
  p_table_id uuid,
  p_type text default 'assistance'
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_id uuid;
  v_call_id uuid;
begin
  if p_type not in ('assistance', 'bill') then
    raise exception 'invalid_waiter_call_type';
  end if;

  select project_id into v_project_id
  from public.tables
  where id = p_table_id
    and is_active = true
    and exists (
      select 1 from public.projects p
      where p.id = tables.project_id and p.is_active = true
    );

  if v_project_id is null then
    raise exception 'table_not_found';
  end if;

  insert into public.waiter_calls (table_id, type)
  values (p_table_id, p_type)
  returning id into v_call_id;

  -- Broadcast to any LISTEN/NOTIFY clients; the Supabase Realtime
  -- publication (above) is what dashboard clients actually consume.
  perform pg_notify(
    'waiter_call',
    jsonb_build_object('callId', v_call_id, 'tableId', p_table_id, 'type', p_type)::text
  );

  return jsonb_build_object('callId', v_call_id, 'status', 'pending');
end;
$$;

revoke all on function public.call_waiter(uuid, text) from public;
grant execute on function public.call_waiter(uuid, text) to anon, authenticated;
