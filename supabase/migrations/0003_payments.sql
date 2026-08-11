-- ============================================================================
-- DOKAN — BenefitPay integration (P0.1)
-- ============================================================================
-- Adds a projects.metadata jsonb column (merchant config lives here:
-- metadata->>'benefitpayMerchantId'), the benefitpay_transactions table and
-- the security-definer RPCs that drive the POS payment flow:
--
--   • initiate_benefitpay_payment(project_id, order_id, amount)
--       Validates the merchant is configured + the order belongs to the
--       project, inserts a 'pending' transaction and returns the JSON payload
--       the POS turns into a scannable QR code.
--   • get_benefitpay_transaction(transaction_id)
--       Status polling (the modal polls every 5 s while the QR is shown).
--   • complete_benefitpay_transaction(transaction_id)
--       Marks the transaction 'completed' and the order 'paid'. In the real
--       integration this is the gateway webhook handler; until live merchant
--       credentials exist it is the path a staff member uses to confirm a
--       test/sandbox payment.
--
-- RLS: the table is deny-by-default (no client policies, exactly like
-- staff_pin_attempts) — every read/write goes through the definer RPCs below,
-- which first assert the caller is active staff of the transaction's project.
--
-- Apply order: 0000 → 0001 → 0002 → 0003. Re-runnable.
-- ============================================================================

-- ─── Merchant config column ─────────────────────────────────────────────────

alter table public.projects add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ─── Transactions table (deny by default) ───────────────────────────────────

create table if not exists public.benefitpay_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(10,3) not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  merchant_id text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_benefitpay_tx_order
  on public.benefitpay_transactions(order_id);

create index if not exists idx_benefitpay_tx_status
  on public.benefitpay_transactions(status, created_at desc);

alter table public.benefitpay_transactions enable row level security;
-- No policies on purpose: only the security-definer functions below may
-- read or write this table (mirrors staff_pin_attempts).

-- ─── Initiate ───────────────────────────────────────────────────────────────

create or replace function public.initiate_benefitpay_payment(
  p_project_id uuid,
  p_order_id uuid,
  p_amount numeric(10,3)
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_merchant_id text;
  v_order_project uuid;
  v_tx_id uuid;
begin
  -- Only active staff of the project may start a payment.
  if auth.uid() is null or not public.is_staff(p_project_id) then
    raise exception 'not_authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- The order must belong to the project (no cross-tenant payment initiation).
  select project_id into v_order_project
  from public.orders
  where id = p_order_id;
  if v_order_project is null or v_order_project <> p_project_id then
    raise exception 'order_not_found';
  end if;

  select metadata->>'benefitpayMerchantId' into v_merchant_id
  from public.projects
  where id = p_project_id;
  if v_merchant_id is null or v_merchant_id = '' then
    raise exception 'benefitpay_not_configured';
  end if;

  insert into public.benefitpay_transactions (project_id, order_id, amount, status, merchant_id)
  values (p_project_id, p_order_id, p_amount, 'pending', v_merchant_id)
  returning id into v_tx_id;

  return jsonb_build_object(
    'transactionId', v_tx_id::text,
    'merchantId', v_merchant_id,
    'amount', p_amount,
    'orderId', p_order_id::text,
    'timestamp', extract(epoch from now())
  );
end;
$$;

-- ─── Status poll ────────────────────────────────────────────────────────────

create or replace function public.get_benefitpay_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_id uuid;
  v_status text;
begin
  select project_id, status into v_project_id, v_status
  from public.benefitpay_transactions
  where id = p_transaction_id;

  if v_project_id is null then
    raise exception 'transaction_not_found';
  end if;

  if auth.uid() is null or not public.is_staff(v_project_id) then
    raise exception 'not_authorized';
  end if;

  return jsonb_build_object('transactionId', p_transaction_id::text, 'status', v_status);
end;
$$;

-- ─── Complete (gateway webhook handler / sandbox confirmation) ──────────────

create or replace function public.complete_benefitpay_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_id uuid;
  v_order_id uuid;
begin
  select project_id, order_id into v_project_id, v_order_id
  from public.benefitpay_transactions
  where id = p_transaction_id;

  if v_project_id is null then
    raise exception 'transaction_not_found';
  end if;

  if auth.uid() is null or not public.is_staff(v_project_id) then
    raise exception 'not_authorized';
  end if;

  update public.benefitpay_transactions
  set status = 'completed', updated_at = now()
  where id = p_transaction_id
    and status = 'pending';

  -- Mark the order paid only when the tx actually flipped (idempotent).
  if found then
    update public.orders
    set payment_status = 'paid', updated_at = now()
    where id = v_order_id;
  end if;

  return jsonb_build_object('transactionId', p_transaction_id::text, 'status', 'completed');
end;
$$;

grant execute on function public.initiate_benefitpay_payment(uuid, uuid, numeric) to authenticated;
grant execute on function public.get_benefitpay_transaction(uuid) to authenticated;
grant execute on function public.complete_benefitpay_transaction(uuid) to authenticated;