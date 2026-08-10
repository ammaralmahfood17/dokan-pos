-- ============================================================================
-- DOKAN — Gulf Market POS SaaS · Initial schema
-- ============================================================================
-- Multi-tenant Postgres schema + Row Level Security for the client-only Vite
-- app. Every table is scoped by `project_id`; RLS derives the signed-in user's
-- project from their `staff_members` row (helper `is_staff`). Anonymous users
-- (QR menu) can only read active public menus and insert QR-menu orders.
--
-- HOW TO RUN
--   1. Supabase Dashboard → SQL Editor → paste this whole file → Run.
--      (or `supabase db push` from a machine with the Supabase CLI)
--   2. Supabase Dashboard → Authentication → Providers:
--        - Email: ON, "Confirm email" OFF   (we use email OTP)
--        - Anonymous sign-ins: ON           (guest demo login)
--
-- The file is re-runnable: `CREATE ... IF NOT EXISTS` + `DROP POLICY IF
-- EXISTS` before each policy, so a partial first run can be completed by
-- running it again.
--
-- NOTE: if your tables already exist from an earlier/partial run, running
-- this file again is safe and REQUIRED to complete the schema — it creates
-- the missing `order_sequences` table, adds any missing columns via
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS (see the "Column completion"
-- section), all trigger functions (order numbers, loyalty stamps, updated_at)
-- and every RLS policy. Without a second run you will see NULL order numbers
-- and RLS "violates row-level security" errors.
--
-- If a re-run fails with `42P13: cannot change name of input parameter`,
-- your database holds an older draft of a helper function with a different
-- parameter name (e.g. is_staff). Drop the stale function first:
--   drop function if exists public.is_staff(uuid) cascade;
--   drop function if exists public.project_is_active(uuid) cascade;
-- then run this file again. The cascade only removes RLS policies that
-- reference them — every policy is recreated at the bottom of this file.
-- ============================================================================

-- ─── Core tables ────────────────────────────────────────────────────────────
-- NOTE: the helper functions (is_staff, project_is_active, set_updated_at)
-- are defined AFTER the tables below. SQL-language functions are validated
-- at creation time, so the tables they reference must already exist —
-- defining them first would fail a fresh install with "relation ... does not
-- exist".

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_ar text,
  currency text not null default 'BHD',
  vat_number text,
  vat_rate numeric(5,4) not null default 0.1000,
  logo_url text,
  is_active boolean not null default true,
  subscription_status text not null default 'trial',
  default_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'cashier'
    check (role in ('owner', 'manager', 'cashier', 'kitchen')),
  pin_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, slug)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_ar text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  name_ar text not null,
  description text,
  description_ar text,
  price numeric(12,3) not null default 0,
  cost_price numeric(12,3),
  image_url text,
  allergens text[] not null default '{}',
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  name_ar text not null,
  price numeric(12,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Per-project running counter used by the order_number trigger.
create table if not exists public.order_sequences (
  project_id uuid primary key references public.projects(id) on delete cascade,
  last_number integer not null default 0
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  table_id uuid references public.tables(id) on delete set null,
  staff_id uuid references public.staff_members(id) on delete set null,
  order_number text,
  order_type text not null default 'dine-in'
    check (order_type in ('dine-in', 'takeaway', 'delivery')),
  status text not null default 'pending'
    check (status in ('pending', 'preparing', 'ready', 'delivered', 'cancelled')),
  subtotal numeric(12,3) not null default 0,
  vat_amount numeric(12,3) not null default 0,
  discount_amount numeric(12,3) not null default 0,
  total numeric(12,3) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'benefitpay', 'card')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  customer_phone text,
  customer_name text,
  notes text,
  idempotency_key text,
  source text check (source in ('pos', 'qr-menu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_name_ar text,
  unit_price numeric(12,3) not null default 0,
  quantity numeric(12,3) not null default 1,
  total_price numeric(12,3) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_item_addons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  addon_id uuid references public.addons(id) on delete set null,
  addon_name text not null,
  addon_name_ar text,
  price numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  stamp_target integer not null default 9,
  reward_name text,
  reward_name_ar text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  customer_phone text not null,
  current_stamps integer not null default 0,
  redeemed_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (program_id, customer_phone)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  type text check (type in ('percentage', 'fixed', 'bogo')),
  value numeric(12,3),
  min_order_amount numeric(12,3),
  start_date timestamptz,
  end_date timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Defined here, after the tables, because SQL-language functions are
-- validated at creation time and the tables must already exist.

-- Is the signed-in user an active staff member of the given project?
-- SECURITY DEFINER so the membership check bypasses RLS on staff_members.
-- NOTE: the parameter is deliberately named `p_project_id` (matching the
-- rest of the migration suite). `CREATE OR REPLACE` cannot rename a
-- parameter, so if your database already holds an older draft of this
-- function under a different name, either drop it first or ensure the name
-- matches — keeping it stable makes re-runs safe.
create or replace function public.is_staff(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members s
    where s.project_id = is_staff.p_project_id
      and s.user_id = auth.uid()
      and s.is_active = true
  );
$$;

-- Is the project currently accepting public QR-menu reads/orders?
create or replace function public.project_is_active(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = project_is_active.p_project_id
      and p.is_active = true
  );
$$;

-- Touch `updated_at` on row updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Column completion (safe re-runs over earlier drafts) ───────────────────
-- `create table if not exists` never adds columns, so a database created from
-- an earlier draft of this file may be missing newer columns. These are safe
-- no-ops on a fresh install and heal partial/legacy databases.

alter table public.projects add column if not exists default_language text not null default 'en';
alter table public.products add column if not exists allergens text[] not null default '{}';
alter table public.products add column if not exists is_available boolean not null default true;
alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists source text check (source in ('pos', 'qr-menu'));
alter table public.orders add column if not exists idempotency_key text;
alter table public.orders add column if not exists staff_id uuid references public.staff_members(id) on delete set null;

-- ─── Indexes (match the app's query patterns) ───────────────────────────────

create index if not exists idx_staff_project on public.staff_members(project_id);
create index if not exists idx_staff_user on public.staff_members(user_id) where user_id is not null;
-- PIN lookups are indexed by migration 0002 (idx_staff_pin on project_id,
-- pin_hash). The plaintext pin_code column is dropped there, so it must NOT
-- be indexed here — otherwise re-running 0000 after 0002 would fail with
-- "column pin_code does not exist".
create index if not exists idx_branches_project on public.branches(project_id);
create index if not exists idx_tables_project on public.tables(project_id);
create index if not exists idx_tables_branch on public.tables(branch_id);
create index if not exists idx_categories_project on public.categories(project_id);
create index if not exists idx_products_project on public.products(project_id);
create index if not exists idx_addons_project on public.addons(project_id);
create index if not exists idx_addons_product on public.addons(product_id);
create index if not exists idx_orders_project_created on public.orders(project_id, created_at desc);
create index if not exists idx_orders_project_status on public.orders(project_id, status);
create index if not exists idx_orders_table on public.orders(table_id) where table_id is not null;
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_addons_item on public.order_item_addons(order_item_id);
create index if not exists idx_loyalty_programs_project on public.loyalty_programs(project_id);
create index if not exists idx_loyalty_stamps_program on public.loyalty_stamps(program_id);
create index if not exists idx_promotions_project on public.promotions(project_id);

-- ─── Triggers ───────────────────────────────────────────────────────────────

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- Sequential, per-project order numbers (0001, 0002, …) so the receipt and
-- KDS can show a short human-readable reference.
create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.order_sequences (project_id, last_number)
  values (new.project_id, 1)
  on conflict (project_id)
  do update set last_number = public.order_sequences.last_number + 1
  returning last_number into n;
  new.order_number := lpad(n::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_orders_assign_number on public.orders;
create trigger trg_orders_assign_number
before insert on public.orders
for each row
when (new.order_number is null)
execute function public.assign_order_number();

-- Loyalty stamps: an order with a phone number earns one stamp on the first
-- active loyalty program of the project.
create or replace function public.apply_loyalty_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if new.customer_phone is null or new.status = 'cancelled' then
    return new;
  end if;

  select id into pid
  from public.loyalty_programs
  where project_id = new.project_id
    and active = true
  order by created_at asc
  limit 1;

  if pid is not null then
    insert into public.loyalty_stamps (program_id, customer_phone, current_stamps, redeemed_count)
    values (pid, new.customer_phone, 1, 0)
    on conflict (program_id, customer_phone)
    do update set current_stamps = public.loyalty_stamps.current_stamps + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_loyalty_stamp on public.orders;
create trigger trg_orders_loyalty_stamp
after insert on public.orders
for each row
execute function public.apply_loyalty_stamp();

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table public.projects enable row level security;
alter table public.staff_members enable row level security;
alter table public.branches enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.addons enable row level security;
alter table public.order_sequences enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_addons enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.promotions enable row level security;

-- Projects ---------------------------------------------------------------

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select
  using (public.is_staff(id) or is_active = true);

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert
  with check (auth.uid() is not null);

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update
  using (public.is_staff(id))
  with check (public.is_staff(id));

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete
  using (public.is_staff(id));

-- Staff members ----------------------------------------------------------

drop policy if exists "staff_select" on public.staff_members;
create policy "staff_select" on public.staff_members
  for select
  using (public.is_staff(project_id) or user_id = auth.uid());

drop policy if exists "staff_insert" on public.staff_members;
create policy "staff_insert" on public.staff_members
  for insert
  with check (user_id = auth.uid() or public.is_staff(project_id));

drop policy if exists "staff_update" on public.staff_members;
create policy "staff_update" on public.staff_members
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "staff_delete" on public.staff_members;
create policy "staff_delete" on public.staff_members
  for delete
  using (public.is_staff(project_id));

-- Branches (staff only) ---------------------------------------------------

drop policy if exists "branches_select" on public.branches;
create policy "branches_select" on public.branches
  for select
  using (public.is_staff(project_id));

drop policy if exists "branches_insert" on public.branches;
create policy "branches_insert" on public.branches
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "branches_update" on public.branches;
create policy "branches_update" on public.branches
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "branches_delete" on public.branches;
create policy "branches_delete" on public.branches
  for delete
  using (public.is_staff(project_id));

-- Tables (staff + anonymous QR-menu lookup) ------------------------------

drop policy if exists "tables_select" on public.tables;
create policy "tables_select" on public.tables
  for select
  using (public.is_staff(project_id) or public.project_is_active(project_id));

drop policy if exists "tables_insert" on public.tables;
create policy "tables_insert" on public.tables
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "tables_update" on public.tables;
create policy "tables_update" on public.tables
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "tables_delete" on public.tables;
create policy "tables_delete" on public.tables
  for delete
  using (public.is_staff(project_id));

-- Categories / products / addons (staff + anon public menu) ---------------

drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select
  using (public.is_staff(project_id) or public.project_is_active(project_id));

drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories
  for delete
  using (public.is_staff(project_id));

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select
  using (public.is_staff(project_id) or public.project_is_active(project_id));

drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products
  for delete
  using (public.is_staff(project_id));

drop policy if exists "addons_select" on public.addons;
create policy "addons_select" on public.addons
  for select
  using (public.is_staff(project_id) or public.project_is_active(project_id));

drop policy if exists "addons_insert" on public.addons;
create policy "addons_insert" on public.addons
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "addons_update" on public.addons;
create policy "addons_update" on public.addons
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "addons_delete" on public.addons;
create policy "addons_delete" on public.addons
  for delete
  using (public.is_staff(project_id));

-- Orders (staff CRUD; anonymous QR-menu insert only) ----------------------

drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select
  using (public.is_staff(project_id));

drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert
  with check (
    public.is_staff(project_id)
    or (
      auth.uid() is null
      and source = 'qr-menu'
      and public.project_is_active(project_id)
    )
  );

drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "orders_delete" on public.orders;
create policy "orders_delete" on public.orders
  for delete
  using (public.is_staff(project_id));

-- Order items (follow the parent order's visibility) ----------------------

drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
    )
  );

drop policy if exists "order_items_insert" on public.order_items;
create policy "order_items_insert" on public.order_items
  for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          public.is_staff(o.project_id)
          or (
            auth.uid() is null
            and o.source = 'qr-menu'
            and public.project_is_active(o.project_id)
          )
        )
    )
  );

drop policy if exists "order_items_update" on public.order_items;
create policy "order_items_update" on public.order_items
  for update
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
    )
  );

drop policy if exists "order_items_delete" on public.order_items;
create policy "order_items_delete" on public.order_items
  for delete
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff(o.project_id)
    )
  );

-- Order item addons (via parent item → order) -----------------------------

drop policy if exists "order_item_addons_select" on public.order_item_addons;
create policy "order_item_addons_select" on public.order_item_addons
  for select
  using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
    )
  );

drop policy if exists "order_item_addons_insert" on public.order_item_addons;
create policy "order_item_addons_insert" on public.order_item_addons
  for insert
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and (
          public.is_staff(o.project_id)
          or (
            auth.uid() is null
            and o.source = 'qr-menu'
            and public.project_is_active(o.project_id)
          )
        )
    )
  );

drop policy if exists "order_item_addons_update" on public.order_item_addons;
create policy "order_item_addons_update" on public.order_item_addons
  for update
  using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
    )
  );

drop policy if exists "order_item_addons_delete" on public.order_item_addons;
create policy "order_item_addons_delete" on public.order_item_addons
  for delete
  using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and public.is_staff(o.project_id)
    )
  );

-- Loyalty (staff only; stamps are written by the definer trigger) ---------

drop policy if exists "loyalty_programs_select" on public.loyalty_programs;
create policy "loyalty_programs_select" on public.loyalty_programs
  for select
  using (public.is_staff(project_id));

drop policy if exists "loyalty_programs_insert" on public.loyalty_programs;
create policy "loyalty_programs_insert" on public.loyalty_programs
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "loyalty_programs_update" on public.loyalty_programs;
create policy "loyalty_programs_update" on public.loyalty_programs
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "loyalty_programs_delete" on public.loyalty_programs;
create policy "loyalty_programs_delete" on public.loyalty_programs
  for delete
  using (public.is_staff(project_id));

drop policy if exists "loyalty_stamps_select" on public.loyalty_stamps;
create policy "loyalty_stamps_select" on public.loyalty_stamps
  for select
  using (
    exists (
      select 1 from public.loyalty_programs lp
      where lp.id = loyalty_stamps.program_id
        and public.is_staff(lp.project_id)
    )
  );

-- Promotions (staff only) -------------------------------------------------

drop policy if exists "promotions_select" on public.promotions;
create policy "promotions_select" on public.promotions
  for select
  using (public.is_staff(project_id));

drop policy if exists "promotions_insert" on public.promotions;
create policy "promotions_insert" on public.promotions
  for insert
  with check (public.is_staff(project_id));

drop policy if exists "promotions_update" on public.promotions;
create policy "promotions_update" on public.promotions
  for update
  using (public.is_staff(project_id))
  with check (public.is_staff(project_id));

drop policy if exists "promotions_delete" on public.promotions;
create policy "promotions_delete" on public.promotions
  for delete
  using (public.is_staff(project_id));

-- ─── Grants (idempotent) ────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Orders drive the KDS, POS table occupancy and order lists. RLS decides what
-- each session receives, so no project data leaks across tenants.

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end $$;
