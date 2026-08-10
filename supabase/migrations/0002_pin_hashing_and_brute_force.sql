-- ============================================================================
-- DOKAN — PIN hashing + brute-force protection (P1)
-- ============================================================================
-- Fixes:
--
--  • staff_members.pin_code (plaintext) is dropped and replaced by pin_hash
--    (bcrypt via pgcrypto). PINs are never stored or returned in plaintext,
--    and thanks to the column-level grants from 0001 even the hash is not
--    selectable by any client role.
--
--  • PIN verification moves into verify_staff_pin() (security definer): the
--    hash is compared server-side and only safe columns (never pin_hash) are
--    returned. Callers must already be an active staff member of the project,
--    which prevents cross-tenant PIN probing.
--
--  • staff_pin_attempts records every attempt; ≥5 failed attempts per project
--    within a 15-minute window locks out PIN login for that project.
--
--  • set_staff_pin() (security definer) writes or clears the hash and may
--    only be called by an owner/manager of the staff member's project.
--
-- Apply in order: 0000 → 0001 → 0002.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ─── Schema change ──────────────────────────────────────────────────────────

alter table public.staff_members add column if not exists pin_hash text;
alter table public.staff_members drop column if exists pin_code;
drop index if exists public.idx_staff_pin;

-- ─── Attempt tracking (deny by default: no RLS policies) ────────────────────

create table if not exists public.staff_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  staff_id uuid references public.staff_members(id) on delete set null,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_pin_attempts_project_time
  on public.staff_pin_attempts(project_id, attempted_at desc);

alter table public.staff_pin_attempts enable row level security;
-- No policies on purpose: only the security-definer functions below may
-- write to this table.

-- ─── Verify a 4-digit PIN against the stored bcrypt hash ────────────────────

create or replace function public.verify_staff_pin(p_project_id uuid, p_pin text)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff record;
  v_failed integer;
begin
  -- Only an active staff member of the project may use the PIN flow.
  if auth.uid() is null or not public.is_staff(p_project_id) then
    raise exception 'not_authorized';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin';
  end if;

  -- Brute-force protection: 5 failed attempts in 15 minutes → lockout.
  select count(*) into v_failed
  from public.staff_pin_attempts
  where project_id = p_project_id
    and success = false
    and attempted_at > now() - interval '15 minutes';
  if v_failed >= 5 then
    raise exception 'too_many_attempts';
  end if;

  select s.* into v_staff
  from public.staff_members s
  where s.project_id = p_project_id
    and s.is_active = true
    and s.pin_hash is not null
    and s.pin_hash = crypt(p_pin, s.pin_hash)
  limit 1;

  if v_staff.id is null then
    insert into public.staff_pin_attempts (project_id, success)
    values (p_project_id, false);
    raise exception 'invalid_pin';
  end if;

  insert into public.staff_pin_attempts (project_id, staff_id, success)
  values (p_project_id, v_staff.id, true);

  id := v_staff.id;
  project_id := v_staff.project_id;
  user_id := v_staff.user_id;
  full_name := v_staff.full_name;
  role := v_staff.role;
  is_active := v_staff.is_active;
  created_at := v_staff.created_at;
  return next;
end;
$$;

-- ─── Set / clear a staff member's PIN hash ──────────────────────────────────

create or replace function public.set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id
  from public.staff_members
  where id = p_staff_id;
  if v_project_id is null then
    raise exception 'staff_not_found';
  end if;

  if auth.uid() is null or not public.is_owner_or_manager(v_project_id) then
    raise exception 'not_authorized';
  end if;

  if p_pin is null or p_pin = '' then
    update public.staff_members set pin_hash = null where id = p_staff_id;
    return;
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin';
  end if;

  update public.staff_members
  set pin_hash = crypt(p_pin, gen_salt('bf', 8))
  where id = p_staff_id;
end;
$$;

grant execute on function public.verify_staff_pin(uuid, text) to anon, authenticated;
grant execute on function public.set_staff_pin(uuid, text) to anon, authenticated;
