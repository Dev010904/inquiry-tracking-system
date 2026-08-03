# Inquiry Tracking System — Build Roadmap

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres, Auth, RLS)
**Access:** Responsive PWA deployed on Vercel — one codebase, installable on Android, iOS, Windows, macOS
**Users:** 3–10 staff, roles: `admin` / `staff`
**Reminders:** In-app only (no email/SMS)
**Currency/Tax:** INR, GST fixed at 18% (displayed, never entered)

---

## Why a PWA (deployment answer)

You do **not** need separate mobile apps. Build one responsive Next.js web app and add a PWA manifest + service worker. Result:

| Platform | How it's installed | Feel |
|---|---|---|
| Android | Chrome → "Add to Home screen" | App icon, fullscreen, no browser bar |
| iOS/iPadOS | Safari → Share → "Add to Home Screen" | Same |
| Windows | Edge/Chrome → install icon in address bar | Standalone desktop window, taskbar pin |
| macOS | Chrome/Edge → Install | Dock icon, standalone window |

One build, one deploy, no app-store review, instant updates. If a true native app is ever needed, wrap the same URL in Capacitor later — no rewrite.

---

## Phase 0 — Foundations (Day 1)

- Create Supabase project (region: Mumbai/Singapore), grab URL + anon key + service role key
- `npx create-next-app@latest` — TypeScript, Tailwind, App Router, `src/` dir
- Install: `@supabase/ssr @supabase/supabase-js`, shadcn/ui, `zod`, `react-hook-form`, `date-fns`, `lucide-react`, `sonner`, `recharts`
- `.env.local` + `.env.example`; commit `.gitignore` first
- Set up ESLint/Prettier, `npm run typecheck` script

**Done when:** blank app runs locally and connects to Supabase.

---

## Phase 1 — Database & Security (Day 1–2)

Tables (all with `created_at`, `updated_at`, `created_by`):

1. `profiles` — id (→auth.users), full_name, role (`admin`|`staff`), is_active
2. `companies` — name, type (`company`|`school`|`institution`), city, state, gstin, notes
3. `contacts` — company_id, name, phone, email, designation, is_primary
4. `inquiries` — inquiry_no (auto `INQ-2026-0001`), inquiry_date, company_id, contact_id, source, requirement_summary, estimated_value, status (`new`|`in_discussion`|`quoted`|`negotiation`|`confirmed`|`lost`|`on_hold`), priority, owner_id, lost_reason
5. `followups` — inquiry_id, due_at, channel, note, is_done, done_at, snoozed_to
6. `orders` — order_no (auto `ORD-2026-0001`), inquiry_id (1:1), order_date, order_value (pre-GST — the only money figure typed in), advance_received, gst_amount **generated @ fixed 18%**, total_with_gst **generated**, balance_pending **generated**, delivery_date, order_status (`pending`|`in_production`|`dispatched`|`delivered`|`closed`), completion_pct
7. `payments` — order_id, amount, paid_on, mode, reference (so advance_received is auditable)
8. `work_updates` — polymorphic: parent_type (`order`|`rnd`), parent_id, update_date, note, progress_pct, author_id
9. `rnd_projects` — project_code, project_name, description, approx_budget, spent_to_date, start_date, target_date, stage (`concept`|`design`|`prototype`|`testing`|`completed`|`shelved`), lead_id, progress_pct
10. `activity_log` — table_name, row_id, action, actor_id, diff (jsonb)

**Security (this is the "company specific, credentials only" requirement):**

- Supabase Auth, **email + password only**. Disable public sign-up in Auth settings — admin creates users via Supabase dashboard or an admin-only invite route.
- RLS enabled on **every** table. Policy: `auth.uid()` must map to an `is_active = true` row in `profiles`. No anonymous read anywhere.
- Delete permitted to `admin` only; staff can insert/update.
- Next.js middleware redirects any unauthenticated request to `/login`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.

**Done when:** migrations applied, seed data loads, and an unauthenticated `curl` to the API returns zero rows.

---

## Phase 2 — Auth Shell (Day 2)

- `/login` page, session via `@supabase/ssr` cookies
- Protected layout: sidebar (desktop) / bottom tab bar (mobile), user menu, sign out
- 401/403 and "account deactivated" states

---

## Phase 3 — Main Dashboard (Day 3–4)

- KPI cards: Open Inquiries · Confirmed This Month · Order Value MTD · Balance Pending · Overdue Follow-ups
- **Today's & Overdue Follow-ups panel** — the alarm surface. Overdue = red, due today = amber, upcoming 7 days = grey. Mark done / snooze inline.
- Inquiry table: date, company/school, contact (name·phone·email·designation), status pill, value, next follow-up, owner
- Filters: date range, status, type, owner, search; sortable columns; CSV export
- Mobile: table collapses to cards

---

## Phase 4 — Inquiry Module (Day 4–5)

- New/edit inquiry form (company picker with inline-create, multiple contacts)
- Inquiry detail page: timeline of follow-ups + status changes
- **Convert to Order** action — only from `quoted`/`negotiation`; sets status `confirmed` and creates the linked order

---

## Phase 5 — Confirmed Orders Module (Day 5–6)

- Orders list: order no, company, order value, GST 18%, total, advance, **balance pending**, delivery date, status, progress bar
- Order detail: invoice-style financials card — Order Value → GST @ 18% → Total with GST → Advance → Balance Pending, all auto-computed and read-only. Same breakdown as a live preview in the order form and in the print view.
- Payments ledger, delivery timeline, work-update feed
- Overdue-delivery highlighting
- Aging view: balance pending by 0–30 / 31–60 / 60+ days

---

## Phase 6 — R&D Module (Day 6–7)

- Project list: name, code, approx budget, spent, stage, timeline, progress
- Gantt-lite / timeline bar view of start → target
- Work-update feed per project with progress %
- Budget vs spent bar

---

## Phase 7 — Polish & PWA (Day 7–8)

- `manifest.json`, icons (192/512/maskable), service worker, iOS meta tags, install prompt
- Loading skeletons, empty states, toasts, error boundary
- Keyboard shortcuts, print-friendly order view
- Reports page: monthly inquiry→order conversion, value by month, win/loss reasons

---

## Phase 8 — Verify & Ship (Day 8)

- Seed 20 realistic rows; verify GST/balance math against manual calc
- **Security test:** log in as staff, attempt to delete → blocked; hit API logged out → empty
- Mobile check at 375px, tablet 768px, desktop 1440px
- Deploy to Vercel, set env vars, add Supabase redirect URLs, install on one phone + one desktop
- Backup plan: Supabase daily backups + monthly CSV export

---

## Folder Structure

```
inquiry-tracking-system/
├── docs/
│   ├── roadmap/ROADMAP.md
│   ├── specs/DATA-MODEL.md
│   ├── DEPLOY.md
│   └── HANDOVER.md
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   ├── inquiries/[id]/
│   │   │   ├── orders/[id]/
│   │   │   ├── rnd/[id]/
│   │   │   ├── companies/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── api/
│   │   └── layout.tsx
│   ├── components/{ui,dashboard,inquiries,orders,rnd,shared}/
│   ├── lib/{supabase,validations,utils,constants}/
│   ├── hooks/
│   ├── types/
│   └── middleware.ts
├── supabase/migrations/
├── public/{icons,manifest.json}
└── .env.example
```

## Success Criteria

1. No data is reachable without a valid username/password.
2. Balance pending and GST are never hand-typed — always computed.
3. No follow-up can silently go missing; overdue items are visible on the dashboard.
4. Works and looks right on a phone, installed to home screen.
