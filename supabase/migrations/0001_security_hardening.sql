-- ============================================================================
-- DOKAN — Security hardening (P0): RLS re-derivation + security-definer RPCs
-- ============================================================================
-- Fixes (see the security review):
--
--  1. staff_members self-service insert is removed. The old
--     `user_id = auth.uid()` branch let ANY authenticated user (including
--     anonymous guests) insert an `owner` staff row for themselves into any
--     project. Staff rows are now only insertable by an existing
--     owner/manager of the same project (is_owner_or_manager), or by
--     create_project_with_owner() during onboarding.
--
--  2. projects is no longer broadly readable. The blanket
--     `is_active = true` anon clause is removed so anonymous sessions cannot
--     enumerate every tenant (id, vat_number, subscription_status, ...).
--     Anonymous reads are narrowed to the security-definer RPCs
--     public_project_by_slug() and public_menu_by_slug(), which return only
--     the columns the QR menu needs — never vat_number or
--     subscription_status — and never cost_price on products.
--
--  3. Order pricing is no longer client-trusted. create_order() (security
--     definer) reloads unit prices from products/addons server-side, computes
--     subtotal / VAT / discount / total inside Postgres, and inserts the
--     order + items + addons in ONE transaction (atomic by construction).
--     order_items / order_item_addons no longer accept direct anonymous
--     inserts — all writes go through create_order().
--
--  4. Idempotency: unique (project_id, idempotency_key) constraint plus a
--     dedupe pre-check inside create_order() (with a unique_violation
--     fallback), so retries of the same queued order can never duplicate.
--
--  5. Branch-level authorization: staff_branch_assignments +
--     is_branch_member() + can_access_branch() scope orders/tables reads and
--     writes by branch membership for multi-branch tenants (owners/managers
--     always pass; staff with no assignments keep project-wide access, which
--     keeps single-branch and legacy tenants working unchanged).
--
--  6. staff_members column privileges are narrowed: pin_hash is neither
--     selectable nor writable by any client role. The app reads staff through
--     the security-invoker view staff_view (safe columns + has_pin only),
--     which is created in 0002 because it references the pin_hash column
--     that only 0002 adds.
--
-- Apply in order: 0000 → 0001 → 0002. This file is re-runnable (DROP POLICY
-- IF EXISTS / CREATE OR REPLACE), but note that dropping `projects_insert`
-- below permanently disables direct project inserts — that is intentional.
-- ============================================================================

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Is the current request coming from an anonymous (guest) Supabase session?
-- (JWT claim `is_anonymous`, set by signInAnonymously.)
create or replace function public.is_anonymous_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Is the signed-in user an active owner/manager of the given project?
create or replace function public.is_owner_or_manager(project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members s
    where s.project_id = is_owner_or_manager.project_id
      and s.user_id = auth.uid()
      and s.is_active = true
      and s.role in ('owner', 'manager')
  );
$$;

-- ─── Branch membership (P1 §3) ──────────────────────────────────────────────

create table if not exists public.staff_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  role text not null default 'cashier'
    check (role in ('owner', 'manager', 'cashier', 'kitchen')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (staff_id, branch_id)
);

create index if not exists idx_sba_project on public.staff_branch_assignments(project_id);
create index if not exists idx_sba_staff on public.staff_branch_assignments(staff_id);
create index if not exists idx_sba_branch on public.staff_branch_assignments(branch_id);

-- Is the signed-in user a member of the given branch?
--   • owners/managers always pass (they manage the whole tenant)
--   • staff with an active assignment to that branch pass
--   • staff with NO assignments at all pass (project-wide access by default)
create or replace function public.is_branch_member(branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.branches b
    where b.id = is_branch_member.branch_id
      and exists (
        select 1 from public.staff_members s
        where s.user_id = auth.uid()
          and s.project_id = b.project_id
          and s.is_active = true
          and (
            s.role in ('owner', 'manager')
            or not exists (
              select 1 from public.staff_branch_assignments sba
              where sba.staff_id = s.id
            )
            or exists (
              select 1 from public.staff_branch_assignments sba2
              where sba2.staff_id = s.id
                and sba2.branch_id = b.id
                and sba2.is_active = true
            )
          )
      )
  );
$$;

-- Combined check used by orders/tables policies: the branch must belong to
-- the given project AND the user must be able to access it. A NULL branch id
-- (project-level rows, e.g. takeaway orders) is always allowed.
create or replace function public.can_access_branch(branch_id uuid, project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    branch_id is null
    or (
      exists (
        select 1 from public.branches b
        where b.id = can_access_branch.branch_id
          and b.project_id = can_access_branch.project_id
      )
      and public.is_branch_member(can_access_branch.branch_id)
    );
$$;

alter table public.staff_branch_assignments enable row level security;

drop policy if exists "sba_select" on public.staff_branch_assignments;
create policy "sba_select" on public.staff_branch_assignments
  for select using (public.is_staff(project_id));

drop policy if exists "sba_insert" on public.staff_branch_assignments;
create policy "sba_insert" on public.staff_branch_assignments
  for insert with check (public.is_staff(project_id));

drop policy if exists "sba_update" on public.staff_branch_assignments;
create policy "sba_update" on public.staff_branch_assignments
  for update using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "sba_delete" on public.staff_branch_assignments;
create policy "sba_delete" on public.staff_branch_assignments
  for delete using (public.is_staff(project_id));

grant select, insert, update, delete on public.staff_branch_assignments to authenticated;

-- Backfill: existing owners/managers get an assignment to every active branch
-- so multi-branch tenants' admins are never locked out by the new scoping.
insert into public.staff_branch_assignments (project_id, staff_id, branch_id, role)
select s.project_id, s.id, b.id, s.role
from public.staff_members s
join public.branches b on b.project_id = s.project_id and b.is_active = true
where s.is_active = true
  and s.role in ('owner', 'manager')
on conflict (staff_id, branch_id) do nothing;

-- ─── RPC: create project + owner + first branch + tables (atomic) ──────────

create or replace function public.create_project_with_owner(
  p_name text,
  p_name_ar text default null,
  p_branch_name text default 'Main Branch',
  p_branch_name_ar text default null,
  p_table_names text[] default '{}',
  p_currency text default 'BHD',
  p_vat_rate numeric default 0.1000,
  p_default_language text default 'en'
)
returns uuid  -- the new project id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project_id uuid;
  v_branch_id uuid;
  v_staff_id uuid;
  v_base text;
  v_slug text;
  v_n integer := 2;
  v_tname text;
  v_tbase text;
  v_tindex integer := 1;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Product decision: one workspace per user (unless invited to another
  -- project). Enforced server-side, not just in the client.
  if exists (
    select 1 from public.staff_members s
    where s.user_id = v_uid and s.is_active = true
  ) then
    raise exception 'workspace_exists';
  end if;

  -- Server-generated unique slug (client text is never used as a key).
  v_base := left(btrim(regexp_replace(lower(coalesce(p_name, 'dokan')), '[^a-z0-9]+', '-', 'g'), '-'), 40);
  if v_base = '' then v_base := 'dokan'; end if;
  v_slug := v_base;
  while exists (select 1 from public.projects where slug = v_slug) loop
    v_slug := v_base || '-' || v_n;
    v_n := v_n + 1;
  end loop;

  insert into public.projects (slug, name, name_ar, currency, vat_rate, default_language)
  values (
    v_slug,
    coalesce(p_name, 'My Restaurant'),
    p_name_ar,
    coalesce(p_currency, 'BHD'),
    coalesce(p_vat_rate, 0.1),
    coalesce(p_default_language, 'en')
  )
  returning id into v_project_id;

  insert into public.staff_members (project_id, user_id, full_name, role, is_active)
  values (v_project_id, v_uid, coalesce(nullif(p_name, ''), 'Owner'), 'owner', true)
  returning id into v_staff_id;

  insert into public.branches (project_id, name, name_ar)
  values (v_project_id, coalesce(nullif(p_branch_name, ''), 'Main Branch'), p_branch_name_ar)
  returning id into v_branch_id;

  insert into public.staff_branch_assignments (project_id, staff_id, branch_id, role)
  values (v_project_id, v_staff_id, v_branch_id, 'owner');

  if p_table_names is not null then
    foreach v_tname in array p_table_names loop
      if v_tname is null or btrim(v_tname) = '' then
        continue;
      end if;
      v_tbase := left(btrim(regexp_replace(lower(v_tname), '[^a-z0-9]+', '-', 'g'), '-'), 40);
      if v_tbase = '' then v_tbase := 'table'; end if;
      insert into public.tables (project_id, branch_id, name, slug, is_active)
      values (v_project_id, v_branch_id, v_tname, v_tbase || '-' || v_tindex, true);
      v_tindex := v_tindex + 1;
    end loop;
  end if;

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_owner(text, text, text, text, text[], text, numeric, text) to anon, authenticated;

-- ─── RPC: narrow public project lookup by slug ──────────────────────────────
-- Returns only the columns the QR menu needs. Explicitly NOT vat_number and
-- NOT subscription_status.

create or replace function public.public_project_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  name_ar text,
  currency text,
  vat_rate numeric,
  logo_url text,
  default_language text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.name_ar, p.currency, p.vat_rate, p.logo_url, p.default_language
  from public.projects p
  where p.slug = p_slug
    and p.is_active = true;
$$;

grant execute on function public.public_project_by_slug(text) to anon, authenticated;

-- ─── RPC: full public QR menu by slug (single round-trip) ───────────────────
-- Returns project + table + categories + products + addons as one jsonb.
-- Products deliberately exclude cost_price. Requires a valid active table
-- when a table slug is supplied (an order can only be placed at a real table).

create or replace function public.public_menu_by_slug(p_slug text, p_table_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_project jsonb;
  v_table jsonb;
  v_categories jsonb;
  v_products jsonb;
  v_addons jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'name_ar', p.name_ar,
    'currency', p.currency,
    'vat_rate', p.vat_rate,
    'logo_url', p.logo_url,
    'default_language', p.default_language
  ) into v_project
  from public.projects p
  where p.slug = p_slug
    and p.is_active = true;

  if v_project is null then
    return null;
  end if;

  v_project_id := (v_project->>'id')::uuid;

  if p_table_slug is not null then
    select jsonb_build_object('id', t.id, 'name', t.name) into v_table
    from public.tables t
    where t.project_id = v_project_id
      and t.slug = p_table_slug
      and t.is_active = true
      and exists (
        select 1 from public.branches b
        where b.id = t.branch_id and b.is_active = true
      );
    if v_table is null then
      return jsonb_build_object('error', 'table_not_found');
    end if;
  else
    v_table := null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id, 'name', c.name, 'name_ar', c.name_ar
      ) order by c.sort_order, c.name
    ), '[]'::jsonb)
  into v_categories
  from public.categories c
  where c.project_id = v_project_id and c.is_active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'category_id', pr.category_id,
        'name', pr.name,
        'name_ar', pr.name_ar,
        'description', pr.description,
        'description_ar', pr.description_ar,
        'price', pr.price,
        'image_url', pr.image_url,
        'allergens', pr.allergens,
        'is_available', pr.is_available
      ) order by pr.name
    ), '[]'::jsonb)
  into v_products
  from public.products pr
  where pr.project_id = v_project_id and pr.is_active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'product_id', a.product_id,
        'name', a.name,
        'name_ar', a.name_ar,
        'price', a.price
      ) order by a.name
    ), '[]'::jsonb)
  into v_addons
  from public.addons a
  where a.project_id = v_project_id and a.is_active = true;

  return jsonb_build_object(
    'project', v_project,
    'table', v_table,
    'categories', v_categories,
    'products', v_products,
    'addons', v_addons
  );
end;
$$;

grant execute on function public.public_menu_by_slug(text, text) to anon, authenticated;

-- ─── RPC: create an order with server-side pricing (atomic) ─────────────────
-- Re-validates every product/addon price against the database, computes
-- subtotal/vat/discount/total server-side and inserts order + items + addons
-- in a single transaction. Idempotent on (project_id, idempotency_key).

create or replace function public.create_order(
  p_project_id uuid,
  p_table_id uuid default null,
  p_table_slug text default null,
  p_order_type text default 'dine-in',
  p_payment_method text default 'cash',
  p_payment_status text default 'pending',
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null,
  p_discount_amount numeric default 0,
  p_staff_id uuid default null,
  p_source text default 'pos',
  p_idempotency_key text default null,
  p_items jsonb default '[]'::jsonb
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_table record;
  v_staff_id uuid;
  v_product record;
  v_addon record;
  v_item jsonb;
  v_addon_json jsonb;
  v_unit_price numeric;
  v_addons_total numeric;
  v_quantity numeric;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_vat numeric;
  v_total numeric;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_existing_id uuid;
  v_existing_number text;
begin
  -- Idempotency: return the existing order instead of duplicating.
  if p_idempotency_key is not null then
    select o.id, o.order_number into v_existing_id, v_existing_number
    from public.orders o
    where o.project_id = p_project_id
      and o.idempotency_key = p_idempotency_key
    limit 1;
    if v_existing_id is not null then
      order_id := v_existing_id;
      order_number := v_existing_number;
      return next;
      return;
    end if;
  end if;

  select * into v_project
  from public.projects p
  where p.id = p_project_id and p.is_active = true;
  if v_project.id is null then
    raise exception 'project_not_found';
  end if;

  -- ── Authorization ──────────────────────────────────────────────────────
  if p_source = 'qr-menu' then
    -- QR orders: only unauthenticated or anonymous-guest sessions.
    if auth.uid() is not null and not public.is_anonymous_user() then
      raise exception 'not_authorized';
    end if;

    if p_table_id is null and p_table_slug is not null then
      select t.id into p_table_id
      from public.tables t
      where t.project_id = p_project_id
        and t.slug = p_table_slug
        and t.is_active = true
      limit 1;
    end if;
    select * into v_table
    from public.tables t
    where t.id = p_table_id
      and t.project_id = p_project_id
      and t.is_active = true;
    if v_table.id is null then
      raise exception 'table_not_found';
    end if;
  else
    -- POS orders: an active staff member of the project only.
    if auth.uid() is null or not public.is_staff(p_project_id) then
      raise exception 'not_authorized';
    end if;

    -- Attribution: prefer the PIN-selected staff row, fall back to the
    -- caller's own staff row. Both must belong to the project.
    if p_staff_id is not null then
      select s.id into v_staff_id
      from public.staff_members s
      where s.id = p_staff_id
        and s.project_id = p_project_id
        and s.is_active = true
      limit 1;
    end if;
    if v_staff_id is null then
      select s.id into v_staff_id
      from public.staff_members s
      where s.user_id = auth.uid()
        and s.project_id = p_project_id
        and s.is_active = true
      order by s.created_at
      limit 1;
    end if;

    if p_table_id is not null then
      select * into v_table
      from public.tables t
      where t.id = p_table_id
        and t.project_id = p_project_id
        and t.is_active = true;
      if v_table.id is null then
        raise exception 'table_not_found';
      end if;
      -- Branch-scoped tenants: the ordering staff member must have access.
      if not public.can_access_branch(v_table.branch_id, p_project_id) then
        raise exception 'not_authorized';
      end if;
    end if;
  end if;

  -- ── Server-side price re-validation (never trust client prices) ────────
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select pr.id, pr.price, pr.name, pr.name_ar into v_product
    from public.products pr
    where pr.id = (v_item->>'product_id')::uuid
      and pr.project_id = p_project_id
      and pr.is_active = true
      and pr.is_available = true;
    if v_product.id is null then
      raise exception 'unknown_product';
    end if;

    v_unit_price := v_product.price;
    v_addons_total := 0;

    if v_item ? 'addons' and jsonb_typeof(v_item->'addons') = 'array' then
      for v_addon_json in select * from jsonb_array_elements(v_item->'addons')
      loop
        select a.id, a.price, a.name, a.name_ar into v_addon
        from public.addons a
        where a.id = (v_addon_json->>'addon_id')::uuid
          and a.project_id = p_project_id
          and a.product_id = v_product.id
          and a.is_active = true;
        if v_addon.id is null then
          raise exception 'unknown_addon';
        end if;
        v_addons_total := v_addons_total + v_addon.price;
      end loop;
    end if;

    v_quantity := greatest(coalesce((v_item->>'quantity')::numeric, 1), 1);
    v_subtotal := v_subtotal + (v_unit_price + v_addons_total) * v_quantity;
  end loop;

  v_discount := coalesce(p_discount_amount, 0);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'invalid_discount';
  end if;
  v_vat := greatest(0, (v_subtotal - v_discount) * coalesce(v_project.vat_rate, 0.1));
  v_total := greatest(0, v_subtotal - v_discount + v_vat);

  -- ── Insert order + items + addons (atomic) ─────────────────────────────
  insert into public.orders (
    project_id, branch_id, table_id, staff_id, order_type, status,
    subtotal, vat_amount, discount_amount, total,
    payment_method, payment_status, customer_name, customer_phone, notes,
    idempotency_key, source
  ) values (
    p_project_id, v_table.branch_id, v_table.id, v_staff_id,
    case when p_order_type in ('dine-in', 'takeaway', 'delivery') then p_order_type else 'dine-in' end,
    'pending',
    round(v_subtotal, 3), round(v_vat, 3), round(v_discount, 3), round(v_total, 3),
    coalesce(p_payment_method, 'cash'),
    case when p_payment_status in ('paid', 'pending') then p_payment_status else 'pending' end,
    p_customer_name, p_customer_phone, p_notes, p_idempotency_key, p_source
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select pr.id, pr.price, pr.name, pr.name_ar into v_product
    from public.products pr
    where pr.id = (v_item->>'product_id')::uuid
      and pr.project_id = p_project_id;
    v_unit_price := v_product.price;
    v_addons_total := 0;
    v_quantity := greatest(coalesce((v_item->>'quantity')::numeric, 1), 1);

    if v_item ? 'addons' and jsonb_typeof(v_item->'addons') = 'array' then
      for v_addon_json in select * from jsonb_array_elements(v_item->'addons')
      loop
        select a.id, a.price, a.name, a.name_ar into v_addon
        from public.addons a
        where a.id = (v_addon_json->>'addon_id')::uuid
          and a.project_id = p_project_id
          and a.product_id = v_product.id
          and a.is_active = true;
        if v_addon.id is null then
          raise exception 'unknown_addon';
        end if;
        v_addons_total := v_addons_total + v_addon.price;
      end loop;
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total_price, notes
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.name_ar,
      round(v_unit_price, 3), v_quantity,
      round((v_unit_price + v_addons_total) * v_quantity, 3),
      nullif(v_item->>'notes', '')
    )
    returning id into v_item_id;

    if v_item ? 'addons' and jsonb_typeof(v_item->'addons') = 'array' then
      for v_addon_json in select * from jsonb_array_elements(v_item->'addons')
      loop
        select a.id, a.price, a.name, a.name_ar into v_addon
        from public.addons a
        where a.id = (v_addon_json->>'addon_id')::uuid
          and a.project_id = p_project_id
          and a.product_id = v_product.id
          and a.is_active = true;
        insert into public.order_item_addons (order_item_id, addon_id, addon_name, addon_name_ar, price)
        values (v_item_id, v_addon.id, v_addon.name, v_addon.name_ar, round(v_addon.price, 3));
      end loop;
    end if;
  end loop;

  order_id := v_order_id;
  order_number := v_order_number;
  return next;
exception
  -- Two concurrent requests with the same idempotency key: the unique
  -- constraint wins; return the row the other request created.
  when unique_violation then
    if p_idempotency_key is not null then
      select o.id, o.order_number into v_existing_id, v_existing_number
      from public.orders o
      where o.project_id = p_project_id
        and o.idempotency_key = p_idempotency_key
      limit 1;
      if v_existing_id is not null then
        order_id := v_existing_id;
        order_number := v_existing_number;
        return next;
        return;
      end if;
    end if;
    raise;
end;
$$;

grant execute on function public.create_order(
  uuid, uuid, text, text, text, text, text, text, text, numeric, uuid, text, text, jsonb
) to anon, authenticated;

-- ─── Idempotency constraint (nullable column → multiple NULLs allowed) ──────

alter table public.orders drop constraint if exists orders_idempotency_key_unique;
alter table public.orders add constraint orders_idempotency_key_unique unique (project_id, idempotency_key);

-- ─── RLS policy re-derivation ───────────────────────────────────────────────

-- Projects: staff-only reads; owner/manager writes; no direct inserts (the
-- only writer is create_project_with_owner, a security definer RPC).
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (public.is_staff(id));

drop policy if exists "projects_insert" on public.projects;
-- (deliberately NOT recreated — direct project inserts are disabled)

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update using (public.is_owner_or_manager(id))
  with check (public.is_owner_or_manager(id));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete using (public.is_owner_or_manager(id));

-- Staff members: reads by project staff (or the member themselves); all
-- writes restricted to owners/managers. The self-service insert branch is
-- gone; pin_hash is additionally hidden by column-level grants (below).
drop policy if exists "staff_select" on public.staff_members;
create policy "staff_select" on public.staff_members
  for select using (public.is_staff(project_id) or user_id = auth.uid());

drop policy if exists "staff_insert" on public.staff_members;
create policy "staff_insert" on public.staff_members
  for insert with check (public.is_owner_or_manager(project_id));

drop policy if exists "staff_update" on public.staff_members;
create policy "staff_update" on public.staff_members
  for update using (public.is_owner_or_manager(project_id))
  with check (public.is_owner_or_manager(project_id));

drop policy if exists "staff_delete" on public.staff_members;
create policy "staff_delete" on public.staff_members
  for delete using (public.is_owner_or_manager(project_id));

-- Tables: staff-only, scoped by branch membership.
drop policy if exists "tables_select" on public.tables;
create policy "tables_select" on public.tables
  for select using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "tables_insert" on public.tables;
create policy "tables_insert" on public.tables
  for insert with check (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "tables_update" on public.tables;
create policy "tables_update" on public.tables
  for update using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id))
  with check (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "tables_delete" on public.tables;
create policy "tables_delete" on public.tables
  for delete using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

-- Categories / products / addons: staff-only now. Anonymous menu reads go
-- exclusively through public_menu_by_slug() (no more direct anon SELECT on
-- these tables, which previously exposed cost_price to the public).
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select using (public.is_staff(project_id));

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select using (public.is_staff(project_id));

drop policy if exists "addons_select" on public.addons;
create policy "addons_select" on public.addons
  for select using (public.is_staff(project_id));

-- Orders: staff-only, scoped by branch membership. Anonymous QR orders are
-- created exclusively through the create_order RPC.
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert with check (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders
  for update using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id))
  with check (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

drop policy if exists "orders_delete" on public.orders;
create policy "orders_delete" on public.orders
  for delete using (public.is_staff(project_id) and public.can_access_branch(branch_id, project_id));

-- Order items: visibility follows the parent order; inserts are staff-only
-- (the anonymous QR branch is removed — all writes go through create_order).
drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_items_insert" on public.order_items;
create policy "order_items_insert" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_items_update" on public.order_items;
create policy "order_items_update" on public.order_items
  for update using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_items_delete" on public.order_items;
create policy "order_items_delete" on public.order_items
  for delete using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

-- Order item addons: via parent item → order; inserts staff-only.
drop policy if exists "order_item_addons_select" on public.order_item_addons;
create policy "order_item_addons_select" on public.order_item_addons
  for select using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_item_addons_insert" on public.order_item_addons;
create policy "order_item_addons_insert" on public.order_item_addons
  for insert with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_item_addons_update" on public.order_item_addons;
create policy "order_item_addons_update" on public.order_item_addons
  for update using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

drop policy if exists "order_item_addons_delete" on public.order_item_addons;
create policy "order_item_addons_delete" on public.order_item_addons
  for delete using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
        and public.can_access_branch(o.branch_id, o.project_id)
    )
  );

-- ─── Column-level grants on staff_members ───────────────────────────────────
-- pin_hash is neither selectable nor writable by any client role; the staff
-- table's remaining columns are granted explicitly (defense in depth on top
-- of the row-level policies above). The `staff_view` (safe columns +
-- has_pin) is created in 0002, immediately after that migration adds the
-- pin_hash column it references.
revoke all on public.staff_members from anon, authenticated;
grant select (id, project_id, user_id, full_name, role, is_active, created_at) on public.staff_members to anon, authenticated;
grant insert (project_id, user_id, full_name, role, is_active) on public.staff_members to anon, authenticated;
grant update (full_name, role, is_active) on public.staff_members to anon, authenticated;
grant delete on public.staff_members to anon, authenticated;

-- ─── Notes on the blanket grant (P2 review) ─────────────────────────────────
-- The 0000 migration ends with `grant select, insert, update, delete on all
-- tables ... to anon, authenticated`. That remains safe ONLY because every
-- table now has correct RLS policies that deny by default:
--   projects              → staff read; owner/manager write; inserts disabled
--   staff_members         → staff read (own row too); owner/manager write
--   branches/tables       → staff + branch scope
--   categories/products/addons → staff only
--   orders/order_items/order_item_addons → staff + branch scope
--   loyalty_* / promotions → staff only (stamps written by definer trigger)
--   order_sequences       → no policies (deny all; definer trigger writes)
--   staff_branch_assignments → staff only
--   staff_pin_attempts    → created in 0002; no policies (deny all)
-- Anonymous sessions can no longer read or write ANY of these tables directly.
