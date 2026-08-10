-- ============================================================================
-- DOKAN — Gulf Market POS SaaS
-- Multi-tenant schema with Row Level Security (port of the original spec)
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RLS helper: is the signed-in user an active staff member of this project?
-- SECURITY DEFINER so the check bypasses RLS (avoids recursion).
-- ----------------------------------------------------------------------------
create or replace function public.is_staff(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

grant execute on function public.is_staff(uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- Projects (tenants)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  name_ar text,
  currency text default 'BHD',
  vat_number text,
  vat_rate numeric(5,4) default 0.10,
  logo_url text,
  is_active boolean default true,
  subscription_status text default 'trial',
  default_language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Staff Members
-- ----------------------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  role text default 'cashier' check (role in ('owner','manager','cashier','kitchen')),
  pin_code text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Branches
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  address text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (branch_id, slug)
);

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  name_ar text not null,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  name_ar text not null,
  description text,
  description_ar text,
  price numeric(10,3) not null,
  cost_price numeric(10,3) default 0,
  image_url text,
  allergens text[] default '{}',
  is_available boolean default true,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Add-ons
-- ----------------------------------------------------------------------------
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  name text not null,
  name_ar text not null,
  price numeric(10,3) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  table_id uuid references public.tables(id) on delete set null,
  staff_id uuid references public.staff_members(id) on delete set null,
  order_number text not null,
  order_type text default 'dine-in' check (order_type in ('dine-in','takeaway','delivery')),
  status text default 'pending' check (status in ('pending','preparing','ready','delivered','cancelled')),
  subtotal numeric(10,3) not null,
  vat_amount numeric(10,3) not null,
  discount_amount numeric(10,3) default 0,
  total numeric(10,3) not null,
  payment_method text default 'cash' check (payment_method in ('cash','benefitpay','card')),
  payment_status text default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  customer_phone text,
  customer_name text,
  notes text,
  idempotency_key text unique,
  source text check (source in ('pos','qr-menu')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists orders_project_idx on public.orders (project_id);
create index if not exists orders_project_status_idx on public.orders (project_id, status);

-- ----------------------------------------------------------------------------
-- Order Items
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_name_ar text,
  unit_price numeric(10,3) not null,
  quantity int not null,
  total_price numeric(10,3) not null,
  notes text,
  created_at timestamptz default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- Order Item Addons
-- ----------------------------------------------------------------------------
create table if not exists public.order_item_addons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references public.order_items(id) on delete cascade,
  addon_id uuid references public.addons(id) on delete set null,
  addon_name text not null,
  addon_name_ar text,
  price numeric(10,3) not null,
  created_at timestamptz default now()
);

create index if not exists oia_item_idx on public.order_item_addons (order_item_id);

-- ----------------------------------------------------------------------------
-- Loyalty Programs
-- ----------------------------------------------------------------------------
create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  stamp_target int default 9,
  reward_name text,
  reward_name_ar text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Loyalty Stamps
-- ----------------------------------------------------------------------------
create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.loyalty_programs(id) on delete cascade,
  customer_phone text not null,
  current_stamps int default 0,
  redeemed_count int default 0,
  created_at timestamptz default now(),
  unique (program_id, customer_phone)
);

-- ----------------------------------------------------------------------------
-- Promotions
-- ----------------------------------------------------------------------------
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  name_ar text,
  type text check (type in ('percentage','fixed','bogo')),
  value numeric(10,3),
  min_order_amount numeric(10,3),
  start_date timestamptz,
  end_date timestamptz,
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.projects enable row level security;
alter table public.staff_members enable row level security;
alter table public.branches enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.addons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_addons enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.promotions enable row level security;

-- Projects: staff can manage their own; anon can read active ones (public menu)
create policy "projects_anon_select" on public.projects
  for select to anon using (is_active = true);
create policy "projects_staff_select" on public.projects
  for select to authenticated using (is_staff(id));
create policy "projects_staff_insert" on public.projects
  for insert to authenticated with check (true);
create policy "projects_staff_update" on public.projects
  for update to authenticated using (is_staff(id)) with check (is_staff(id));

-- Staff members: staff read their project; owner/manager manage; owner self-register
create policy "staff_select" on public.staff_members
  for select to authenticated using (is_staff(project_id));
create policy "staff_insert_owner" on public.staff_members
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'owner');
create policy "staff_insert_managed" on public.staff_members
  for insert to authenticated
  with check (is_staff(project_id) and role in ('manager','cashier','kitchen'));
create policy "staff_update" on public.staff_members
  for update to authenticated using (is_staff(project_id)) with check (is_staff(project_id));
create policy "staff_delete" on public.staff_members
  for delete to authenticated using (is_staff(project_id));

-- Branches
create policy "branches_anon_select" on public.branches
  for select to anon using (
    is_active = true and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "branches_staff_all" on public.branches
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

-- Tables
create policy "tables_anon_select" on public.tables
  for select to anon using (
    is_active = true and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "tables_staff_all" on public.tables
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

-- Categories / Products / Addons: staff manage; anon reads active menu
create policy "categories_anon_select" on public.categories
  for select to anon using (
    is_active = true and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "categories_staff_all" on public.categories
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

create policy "products_anon_select" on public.products
  for select to anon using (
    is_active = true and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "products_staff_all" on public.products
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

create policy "addons_anon_select" on public.addons
  for select to anon using (
    is_active = true and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "addons_staff_all" on public.addons
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

-- Orders: staff manage project orders; anon can create QR-menu orders
create policy "orders_staff_select" on public.orders
  for select to authenticated using (is_staff(project_id));
create policy "orders_staff_insert" on public.orders
  for insert to authenticated with check (is_staff(project_id));
create policy "orders_staff_update" on public.orders
  for update to authenticated using (is_staff(project_id)) with check (is_staff(project_id));
create policy "orders_anon_insert" on public.orders
  for insert to anon with check (
    source = 'qr-menu'
    and order_type = 'dine-in'
    and status = 'pending'
    and payment_status = 'pending'
    and exists (select 1 from public.projects p where p.id = project_id and p.is_active)
  );
create policy "orders_anon_select" on public.orders
  for select to anon using (source = 'qr-menu');

-- Order items: staff manage; anon adds items to QR-menu orders
create policy "items_staff_select" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and is_staff(o.project_id))
  );
create policy "items_staff_insert" on public.order_items
  for insert to authenticated with check (
    exists (select 1 from public.orders o where o.id = order_id and is_staff(o.project_id))
  );
create policy "items_anon_insert" on public.order_items
  for insert to anon with check (
    exists (select 1 from public.orders o where o.id = order_id and o.source = 'qr-menu')
  );

-- Order item addons
create policy "oia_staff_select" on public.order_item_addons
  for select to authenticated using (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and is_staff(o.project_id)
    )
  );
create policy "oia_staff_insert" on public.order_item_addons
  for insert to authenticated with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and is_staff(o.project_id)
    )
  );
create policy "oia_anon_insert" on public.order_item_addons
  for insert to anon with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.source = 'qr-menu'
    )
  );

-- Loyalty programs / stamps / promotions
create policy "loyalty_programs_staff_all" on public.loyalty_programs
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

create policy "stamps_staff_select" on public.loyalty_stamps
  for select to authenticated using (
    exists (select 1 from public.loyalty_programs lp where lp.id = program_id and is_staff(lp.project_id))
  );

create policy "promotions_staff_all" on public.promotions
  for all to authenticated using (is_staff(project_id)) with check (is_staff(project_id));

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-increment order number per project (#0001, #0002, ...)
create or replace function public.generate_order_number()
returns trigger
language plpgsql
as $$
declare
  next_num int;
begin
  select coalesce(max(cast(substring(order_number from 2) as int)), 0) + 1
  into next_num
  from public.orders
  where project_id = new.project_id;

  new.order_number := '#' || lpad(next_num::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trigger_order_number on public.orders;
create trigger trigger_order_number
  before insert on public.orders
  for each row execute function public.generate_order_number();

-- Touch updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_orders_updated_at on public.orders;
create trigger trigger_orders_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Award one loyalty stamp per paid order that carries a phone number
create or replace function public.award_loyalty_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prog_id uuid;
begin
  if new.payment_status = 'paid' and new.customer_phone is not null and new.customer_phone <> '' then
    select id into prog_id
    from public.loyalty_programs
    where project_id = new.project_id and active = true
    limit 1;

    if prog_id is not null then
      insert into public.loyalty_stamps (program_id, customer_phone, current_stamps, redeemed_count)
      values (prog_id, new.customer_phone, 1, 0)
      on conflict (program_id, customer_phone)
      do update set current_stamps = public.loyalty_stamps.current_stamps + 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_loyalty_stamp on public.orders;
create trigger trigger_loyalty_stamp
  after insert or update of payment_status on public.orders
  for each row execute function public.award_loyalty_stamp();

-- ============================================================================
-- Realtime (orders drive the KDS, POS table occupancy, and live lists)
-- ============================================================================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_item_addons;
