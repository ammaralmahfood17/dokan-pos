# Dokan — Gulf Market POS SaaS

POS, QR-menu, and kitchen display system for restaurants and cafés in Bahrain and the Gulf. Bilingual (EN/AR), VAT-compliant, offline-capable.

## Tech Stack

- **Vite + React 19 + TypeScript** (client-only SPA)
- **Tailwind v4 + shadcn/ui** (Minimalism theme)
- **Supabase** — Postgres database, Row Level Security, Auth (email OTP + anonymous), Realtime (drives the KDS & POS)
- **Framer Motion, react-router v7, qrcode, sonner**

All relevant files live in the `src` directory. Use `bun` as the package manager.

## Backend architecture

Dokan has **no Node server** — it's a client-only Vite app, so the backend is:

1. **Postgres schema + RLS** — `supabase/migrations/0000_init.sql`. Every table is scoped by `project_id` and RLS policies (`is_staff(project_id)` via the signed-in user's `staff_members` row). Anonymous users can only read active public menus and insert QR-menu orders.
2. **Client data layer** — `src/lib/api.ts` exposes an `api.*` namespace (`api.catalog.posCatalog`, `api.orders.createOrder`, ...) that maps snake_case rows to the camelCase shapes the UI consumes, with server-side total computation for orders (subtotal, VAT 10%, discount, total).
3. **Reactive queries** — `src/lib/react-query.ts` provides drop-in `useQuery` / `useMutation` hooks. Mutations invalidate mounted queries; the Supabase Realtime channel on `orders` keeps the KDS, POS table occupancy and order lists live across devices.
4. **Offline queue** — `src/lib/offline.ts` queues orders in localStorage while offline and `flushQueue()` replays them on reconnect (wired in the Dashboard shell).

## Setup (Supabase)

1. **Run the migration** — open `supabase/migrations/0000_init.sql` in the Supabase SQL editor and run it (or `supabase db push`). It creates all tables, RLS policies, the order-number trigger, the loyalty-stamp trigger, and adds `orders` to the realtime publication.
2. **Enable auth providers** — Supabase Dashboard → Authentication → Providers:
   - **Email** → turn on, disable "Confirm email" (we use email OTP).
   - **Anonymous sign-ins** → turn on (guest demo login).
3. **Add keys** — in the project's Keys tab, paste:
   - `VITE_SUPABASE_URL` = your Supabase Project URL (e.g. `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = the anon / public key

The app shows a setup banner on `/auth` until the keys are present.

## Auth

Supabase Auth powers both flows (see `src/hooks/use-auth.tsx`):

- **Email OTP** — enter an email → a 6-digit code is emailed → verify. No passwords.
- **Anonymous guest** — instant demo login without an account.

Use the hook everywhere:

```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

- `signIn("email-otp", formData)` sends or verifies the code (`formData` carries `email` and optional `code`)
- `signIn("anonymous")` starts a guest session

**Protected routes** use `RequireAuth` (`src/components/RequireAuth.tsx`), which sends signed-out users to `/auth?returnTo=<route>`. `/auth` redirects to `/dashboard` after sign-in; users with no workspace are sent to `/onboarding` to create their restaurant, branch, tables, and optional demo menu.

**Cashier PIN login** — separate from email auth. Staff members created on the Staff page get a 4-digit PIN; the Dashboard header's "Sign in as cashier" opens a PIN dialog (`src/hooks/use-staff.tsx`). Orders placed in the POS are tagged with that cashier's `staffId`.

## Key routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/auth` | Email OTP / guest login |
| `/onboarding` | Create workspace (protected) |
| `/dashboard` | Overview, POS, KDS, Orders, Products, Categories, Tables, Branches, Staff, Loyalty, Promotions, Reports, Settings (protected) |
| `/m/:projectSlug/:tableSlug` | Public QR menu (anon) |

## Frontend conventions

- Pages in `src/pages`, components in `src/components`, shadcn primitives in `src/components/ui`
- Use the `useI18n()` hook for EN/AR (`t("key")`); Arabic sets `dir="rtl"` and the Tajawal font
- `formatBHD` / `formatTime` / `formatDate` / `computeSLA` helpers live in `src/lib/format.ts`
- Show results/errors with sonner toasts
- Add new routes in `src/main.tsx`
- Buttons and clickable items use `cursor-pointer`; titles use `tracking-tight font-bold`
- Avoid nested cards and shadows; use thin borders. Mobile responsive always.

## Env vars

| Var | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
