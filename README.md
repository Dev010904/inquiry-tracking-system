# ANK Inquiry Tracking System

Internal, credential-gated inquiry → order → R&D tracking for **ANK Design &
Automation Solutions LLP**.

Every route and every row requires a valid login. There is no public page and
no self sign-up — accounts are created by an administrator.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript strict mode
- Tailwind CSS · lucide-react
- Supabase — Postgres, Auth, Row Level Security
- react-hook-form + zod · date-fns · sonner
- Vercel, installable as a PWA

## What it covers

| Module | Tracks |
|---|---|
| Dashboard | Follow-up alarms (overdue / today / next 7 days), IP renewal deadlines, KPIs, recent inquiries |
| Inquiries | Filterable list, capture form with inline company/contact creation, timeline, convert to order |
| Orders | Order value, GST 18%, advance received, balance pending, payments ledger, delivery, work updates |
| R&D | Projects, itemised spend against budget, cross-project timeline, work updates |

## Design rules

1. **Money is computed, never typed.** `gst_amount`, `total_with_gst` and
   `balance_pending` are Postgres generated columns; GST is fixed at 18%.
   `orders.advance_received` and `rnd_projects.spent_to_date` are maintained by
   triggers from their ledgers.
2. **Nothing is hard-deleted.** Soft deletes via `deleted_at`; only an admin
   may delete.
3. **Security is enforced in the database**, not just the UI. Row Level
   Security on every table.
4. **Mobile is a first-class target.** Card layouts under `md`, touch targets
   ≥44px, bottom tab bar on phones.
5. Currency is INR formatted `₹1,23,456`; dates are `DD MMM YYYY`.

## Supabase project

- Ref: `vozvdtgsinocrohmasvq` · URL: `https://vozvdtgsinocrohmasvq.supabase.co`
- Region: Singapore (ap-southeast-1) · Postgres 17

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev
```

`.env.local` is gitignored and must never be committed.

## Setup checklist

- [x] Supabase project created
- [x] Database schema, RLS policies and triggers applied
- [ ] Authentication → Providers → Email → **disable "Allow new users to sign up"**
- [ ] Authentication → Policies → **enable leaked password protection**
- [ ] Clear the seeded demo records before real use (see `docs/HANDOVER.md`)

## Documentation

| Doc | For |
|---|---|
| `docs/DEPLOY.md` | Putting the app online, step by step |
| `docs/HANDOVER.md` | Device install, staff logins, go-live checklist |
| `docs/BUILD-STATUS.md` | What is built, what is not, known constraints |
| `docs/specs/DATA-MODEL.md` | Tables, generated columns, triggers, security model |
| `docs/roadmap/ROADMAP.md` | Phase plan |
