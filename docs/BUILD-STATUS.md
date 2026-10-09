# Build Status

**Company:** ANK Design & Automation Solutions LLP (ankautomation.in)
**Supabase:** `vozvdtgsinocrohmasvq` · Singapore · Postgres 17
**Last updated:** 03 Aug 2026

---

## Done

### Phase 0 — Scaffold ✅
- Next.js 15.5 + React 19 + Tailwind 3.4, TypeScript strict
- `src/middleware.ts` — every route except `/login` requires a session
- `src/lib/supabase/{client,server,middleware,admin}.ts` — admin client guarded by `import 'server-only'`
- `src/lib/constants.ts` — `GST_RATE = 0.18`, all status/stage/IP enums
- `src/lib/format.ts` — `formatINR` (₹1,23,456), `formatDate` (03 Aug 2026)
- `.env.local` written with URL + publishable key, confirmed gitignored
- Typecheck passes

### Phase 1 — Database ✅
12 tables live, RLS on all. See `docs/specs/DATA-MODEL.md` for the full model.

Verified:
- GST/balance generated columns match manual calculation exactly
- `advance_received` auto-sums the payments ledger
- Anonymous role: 0 rows on all 12 tables
- Signed-in non-staff user: 0 rows
- Admin: full access
- 56 audit-log rows written automatically

Seeded: 5 companies, 5 contacts, 8 inquiries (all statuses), 9 follow-ups
(3 overdue / 2 due today / 2 upcoming), 2 orders with payments, 3 R&D
projects, 4 IP assets, 3 IP events.

Hardening applied: `search_path` pinned on all functions; trigger functions
revoked from `anon`/`authenticated`; privilege-escalation guard on `profiles`;
soft-delete guard on all soft-deletable tables.

### Phase 2 — Login + app shell ✅
- `src/app/login/` — server-action sign-in with zod validation, vague
  credential errors (never reveals whether an email exists), and an
  **active-profile check**: a correct password on a deactivated account is
  signed straight back out. `?next=` is restricted to internal paths, so the
  login page cannot be used as an open redirect.
- `src/lib/auth.ts` — `requireProfile()` / `requireAdmin()`. Middleware proves
  there is a session; these prove there is an *active staff profile*.
- `src/app/(app)/layout.tsx` — route group holding every signed-in screen.
  Sidebar ≥ md, five-slot bottom tab bar < md, header avatar menu carrying the
  overflow nav and sign-out. Settings only appears for admins.
- `src/components/ui/` — button, card, badge, input, label, skeleton.
  Default control height 44px for phone use.

### Phase 3 (part) — Dashboard ✅
- **Alarm panel** — IP deadlines first (90/30/7 day lead, colour-stepped),
  then Overdue / Due Today / Next 7 Days follow-ups. Each row carries company,
  contact with tap-to-call, inquiry link, note, and inline **Done** and
  **Snooze 1d/3d/1w**. Rows disappear optimistically; toasts confirm.
- Snooze moves `snoozed_to` forward **from today**, not from the original due
  date — a 3-day-overdue item snoozed 1 day returns tomorrow, not still overdue.
- `done_at` is left to the database trigger; the action never writes it.
- **KPI row** — open inquiries, orders booked this month, order value MTD
  (incl. GST), total balance pending, overdue follow-ups. The last two turn red
  when non-zero.
- **Recent inquiries** — table ≥ md, stacked cards below, with contact name /
  designation / phone / email and the next pending follow-up date.
- `loading.tsx` skeleton and `error.tsx` recovery boundary in place.

Decision worth knowing: *Confirmed this month* and *Order value MTD* are
measured on `orders.order_date`, not on inquiry status, because an order row is
the moment business is actually booked.

### Phase 4 — Inquiries ✅

- **`/inquiries`** — search across inquiry no, requirement and company name;
  filters for status, client type, owner and date range; four sort orders;
  20-per-page pagination. **All filter state lives in the URL**, so a filtered
  view is shareable and survives refresh and the back button. Search is
  debounced at 350ms. Table ≥ md, cards below. Skeleton, empty (two variants —
  "no inquiries yet" vs "nothing matches your filters") and error states.
- **`/inquiries/new`** — company picker with inline "add new company", contact
  sub-form (name, phone, email, designation), requirement, value, priority,
  owner, and a **first follow-up pre-filled to 3 days out**. The follow-up is
  the point of the system, so it defaults on rather than off.
- **`/inquiries/[id]`** — requirement, client card with tap-to-call and mailto,
  pending follow-ups with the same inline Done/Snooze as the dashboard, and a
  timeline merging creation, status changes, follow-ups scheduled and
  completed, and conversion.
- **`/inquiries/[id]/edit`** — same form, minus company creation: editing must
  not silently repoint an existing inquiry at a brand-new company.
- **Convert to Order** — gated on `quoted`/`negotiation` and on no existing
  order. Modal pre-fills from the estimated value and shows the GST breakdown
  live as you type. Only `order_value` is typed; GST, total and balance stay
  Postgres generated columns.

Things worth knowing about the convert flow:

- **The status check is enforced server-side**, not just by the disabled
  button. A stale tab cannot convert a lost inquiry.
- **Order first, status second.** `orders.inquiry_id` is unique, so a double
  submit fails on the constraint rather than creating two orders. If the
  status update then fails, you get "order exists, inquiry still says quoted" —
  visible and fixable — instead of a confirmed inquiry with no order.
- PostgREST has no multi-statement transaction. Create ordering everywhere is
  company → contact → inquiry → follow-up, so a mid-way failure leaves orphaned
  reference data at worst, never a dangling foreign key.
- One schema (`src/lib/schemas/inquiry.ts`) validates on both sides. The client
  copy saves a round trip; the server copy is the rule.

Known gap: the timeline reads `activity_log`, which is **admin-read-only** by
RLS. Staff see creation, follow-ups and conversion but not status-change rows.
Fix later with a `security definer` view if staff need the full history.

Typecheck: 59 source files, zero errors.

### Phase 5 — Orders ✅

- **`/orders`** — full money columns (value · GST · total · received · balance),
  search on order no and company, status / date filters, a **"money
  outstanding"** toggle, four sorts, pagination. Rows with a passed delivery
  date on a still-open order are tinted red and flagged.
- **Summary strip** — total order value, received and outstanding, computed
  across **every order matching the filters, not just the visible page**. A
  total that silently counted 20 rows would be worse than no total. Filter to
  "money outstanding" and read the third tile to answer "what are we owed".
- **`/orders/[id]`** — invoice-style breakdown with an "auto-calculated"
  padlock, payments ledger with add dialog, work-updates feed, delivery panel
  (status, date, PO, notes — no money fields anywhere in it).
- **Work-updates feed** is built polymorphic (`parent_type: 'order' | 'rnd'`)
  and lives in `src/components/work-updates/`, so the R&D phase gets it free.
- `Pagination` moved to `src/components/ui/` and is now shared.

Verified against the live database rather than assumed:

- `recalc_order_advance()` sums `payments` **excluding** `deleted_at is not
  null`, and its trigger fires on INSERT, UPDATE **and** DELETE. So the
  admin-only soft delete correctly reduces `advance_received`, and
  `balance_pending` follows via the generated column.
- Overpayment is allowed on purpose. Rounding, advances against future work
  and corrections are all legitimate; refusing them pushes staff into
  recording nothing. The dialog warns, the database does not block, and a
  negative balance renders as "fully paid, received ₹X more than invoiced".

Known quirk worth knowing: `sync_parent_progress()` sets the parent's progress
to whatever the **most recently posted** update says, not the most recent *by
date*. Back-dating an update with an older % will pull the bar backwards. Fine
in practice, fixable in the trigger if it ever bites.

Typecheck: 74 source files, zero errors.

### Phase 6 — R&D ✅

**Schema change:** new `rnd_expenses` table (13 tables now). `spent_to_date`
was the last hand-typed money figure in the system; it is now the
trigger-maintained sum of an itemised ledger, exactly like order balances.
Existing typed totals were preserved as "Opening balance" rows first — see
`DATA-MODEL.md` for the verification table and the live trigger test.

- **`/rnd`** — KPI row (projects, total budget, total spent, needs-attention),
  **cross-project timeline**, and project cards. Stage filter in the URL.
- **Timeline** — start → target bars scaled across the whole portfolio with a
  vertical "today" line. A bar ending left of that line is a project past its
  target date, which is the thing you want to spot at a glance. Today is
  always inside the scale even if every project finished last year.
- **Cards** — budget-vs-spent bar that goes amber at 80% and red past 100%,
  progress bar, lead, target date, over-budget amount called out.
- **`/rnd/[id]`** — spend ledger with add/remove, budget card with
  remaining-or-over, timeline dates with days-to-target, the shared
  work-updates feed, and linked IP assets.
- **`/rnd/new`** and **`/rnd/[id]/edit`** — project form. Deliberately has **no
  spend field**; a note in the form says where spend actually goes.

Two decisions worth knowing:

- **Budget is an estimate, not a cap.** An expense that exceeds it warns and
  saves anyway. R&D overruns are information, not errors to block.
- **R&D deliberately does not paginate.** It is a handful of projects, and the
  timeline needs the whole set to compute its date range.

Refactor: `addWorkUpdate` moved from `orders/actions.ts` to
`src/lib/actions/work-updates.ts` — orders and R&D own it equally now.

Typecheck: 90 source files, zero errors.

### Phase 7 — Installable app (PWA) ✅

Client will use this for real, and wants it as an app icon rather than a
bookmark. Built:

- `public/manifest.json` — standalone display, `/dashboard` start URL, theme
  colour, plus app shortcuts for "New inquiry" and "Orders" (long-press the
  icon on Android).
- `public/icons/` — 192/512 standard **and** maskable variants, apple-touch
  icon, favicon. Maskable versions keep "ANK" inside the middle 80% safe zone
  because Android crops the icon to a circle. Placeholder mark in brand indigo
  until a logo PNG arrives.
- iOS meta via `appleWebApp` (Safari never fires `beforeinstallprompt`, so
  iPhone users get manual Share → Add to Home Screen instructions instead —
  otherwise they'd see no prompt and assume there is no app).
- `InstallPrompt` component, dismissible for the session.
- `/offline` fallback page, publicly reachable (added to middleware
  `PUBLIC_PATHS` — the device may be offline *and* signed out).

**Service worker caching is deliberately narrow.** Every page here renders
another company's commercial data, so caching page HTML would leave that data
on the device after sign-out and could serve one user's dashboard to the next
person on a shared phone. Only icons and the manifest are cached; all
navigations, Next data and Supabase traffic are network-only. The offline page
contains no business data by design.

**Unbuilt nav hidden.** IP, Companies, Reports and Settings are marked
`unbuilt` in `nav-items.ts` and filtered out of every menu — removing the flag
re-enables them. The two in-app links to `/ip/[id]` (alarm panel, R&D detail)
became plain text. There are now **zero routes a user can reach that 404**.
The mobile tab bar derives its column count from the built items.

Verified: manifest is valid JSON with all icon paths resolving, `sw.js` passes
`node --check`, all five PNGs are correct dimensions, and the go-live cleanup
SQL in `HANDOVER.md` was executed inside a transaction and rolled back — it
runs without foreign-key errors and leaves staff logins untouched.

**Production build still unverified.** `next build` SIGBUSes in this sandbox,
and `next dev` dies the same way — the environment cannot run Next 15's
compiler at all. Tried disabling the webpack build worker, pinning to 1 CPU,
and `--jitless` (which broke WebAssembly instead). This is an environment
limit, not a code fault. **First Vercel deploy is the real test.**

Typecheck: 93 source files, zero errors.

See **`docs/HANDOVER.md`** for the deploy steps, per-device install
instructions, how to create staff logins in Supabase, and the go-live cleanup
script.

### Phase 8 — IP, Companies, Reports, Settings ✅

**The app is now feature-complete. Every nav link resolves; there are no
unbuilt routes and no dead internal links** (verified by extracting every
`href` in `src/` and checking each against the route tree).

- **`/ip`** — portfolio cards with type/status filters, KPI row including
  renewals due within 90 days. Detail page with an event timeline, renewal
  card and ownership panel; create and edit forms. Costs are summed from
  `ip_events` by trigger, never typed. Restricted assets are filtered by
  `can_see_ip()` in Postgres, so a 404 for an unauthorised user reveals
  nothing about the asset's existence.
- **`/companies`** — client cards with primary contact, inquiry and order
  counts, total business and outstanding. Detail page lists all contacts,
  inquiries and orders. Orders reach a company via the inquiry, so the join
  is two hops in the query layer rather than a database view to maintain.
- **`/reports`** — conversion, order value by month, payment aging, loss
  reasons, IP portfolio breakdown. Recharts.
- **`/settings`** — own profile for everyone; for admins, staff accounts with
  role and activate/deactivate controls.

Decisions worth knowing:

- **Conversion is measured by cohort** — an order counts in the month its
  *inquiry* was logged, not the month it closed. Otherwise a good month for
  closing old leads shows over 100% conversion, which tells you nothing. The
  headline rate is won ÷ (won + lost); still-open inquiries are excluded
  rather than counted as losses.
- **Payment aging is measured from the order date**, because the model has no
  separate invoice date. Worth revisiting if invoicing ever splits from
  ordering.
- **Settings cannot create users.** Creating an auth account needs the service
  role key, which deliberately is not deployed. The screen explains the
  Supabase steps instead. Role changes and deactivation *do* work in-app —
  `profiles_update` already allows `is_admin()`.
- **Last-admin guards**: you cannot demote or deactivate yourself, and the
  last active admin cannot be deactivated. Without these, one click could
  lock everyone out of user management with only direct SQL to recover.

Typecheck: 115 source files, zero errors.

### Phase 9 — Attendance (9 Oct 2026, out for team testing)

Fingerprint attendance for the same staff logins: Today, a monthly register
with an Excel download, each person's month, leave and forgotten-punch
requests with approval, and an admin setup (people and device numbers,
office timings, holidays, leave types, devices, pen-drive import). eSSL /
ZKTeco devices push punches over HTTPS (`/iclock/…`); fingerprints never
leave the device. Migration 9_01. Everything — rules, device setup, the test
data left in on purpose and how to remove it — is in `docs/ATTENDANCE.md`.

---

## Next — remaining phases

All planned modules are built. What is left is polish, not function:

1. **Dashboard extras** — CSV export and an inquiries-by-status chart
2. **Print-friendly invoice view** — deferred from the Orders phase
3. **In-app user creation** — needs the service role key deployed first
4. **Timeline gap** — staff cannot see status-change history because
   `activity_log` is admin-read-only; needs a `security definer` view

## Known constraints

- **`next build` crashes in the sandboxed dev environment** (SIGBUS in the Next compiler). Not a code problem — typecheck is clean. Build verification happens on Vercel at first deploy.
- **`npm install` fails inside the Windows mount.** Dependencies install and
  typecheck run from a sandbox-local copy of `src/`. Nothing to fix — just
  don't expect a `node_modules` folder in `C:\inquiry-tracking-system`.
- Nav links to `/ip`, `/companies`, `/reports` and `/settings` are wired but
  those routes do not exist yet, so they 404 until their phase lands. The R&D
  detail page links to `/ip/[id]` for linked assets — same situation.
- **Git repo lives in the sandbox**, not the mounted folder — Windows mounts block the file operations git needs. Source files in `C:\inquiry-tracking-system` are the record; push to GitHub happens at deploy time.

## Needed from you later

- GitHub username (at deploy)
- The **secret** key typed into Vercel's env vars by you (never into chat)
- Company logo PNG for login screen and app icons
- Turn on leaked-password protection: Supabase → Authentication → Policies
