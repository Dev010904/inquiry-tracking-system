# Data Model — as built

Applied to Supabase project `vozvdtgsinocrohmasvq` on 03 Aug 2026. **13 tables**, RLS enabled on all.
(`rnd_expenses` added later the same day — see "R&D spend" below.)

## Tables

| Table | Purpose | Soft delete |
|---|---|---|
| `profiles` | Staff accounts, `admin`/`staff` role, `is_active` | no (deactivate instead) |
| `companies` | Clients — company / school / institution | yes |
| `contacts` | Name, phone, email, designation; one primary per company | yes |
| `inquiries` | `INQ-2026-0001`, status, value, owner | yes |
| `followups` | Deadline rows that drive the alarm panel | no |
| `orders` | `ORD-2026-0001`, order value, GST, balance | yes |
| `payments` | Ledger; sums into `orders.advance_received` | yes |
| `rnd_projects` | `RND-001`, budget, stage, timeline | yes |
| `rnd_expenses` | Spend ledger; sums into `rnd_projects.spent_to_date` | yes |
| `work_updates` | Dated progress feed, polymorphic (order / rnd) | no |
| `ip_assets` | Patents, designs, trademarks, copyright, know-how | yes |
| `ip_events` | Filings, office actions, renewals; sums into `cost_to_date` | no |
| `activity_log` | Trigger-written audit trail, admin read only | insert-only |

## Money — computed, never typed

`orders` has exactly two editable money columns: `order_value` (pre-GST, typed once) and `advance_received` (maintained by trigger from `payments`). Everything else is a generated column with 18% hardcoded:

```sql
gst_amount      GENERATED ALWAYS AS (round(order_value * 0.18, 2)) STORED
total_with_gst  GENERATED ALWAYS AS (order_value + round(order_value * 0.18, 2)) STORED
balance_pending GENERATED ALWAYS AS (order_value + round(order_value * 0.18, 2) - advance_received) STORED
```

There is no `gst_rate` column. Verified against manual calculation:

| Order | Value | GST 18% | Total | Advance | Balance |
|---|---|---|---|---|---|
| ORD-2026-0001 | ₹4,80,000 | ₹86,400 | ₹5,66,400 | ₹2,40,000 | ₹3,26,400 |
| ORD-2026-0002 | ₹12,50,000 | ₹2,25,000 | ₹14,75,000 | ₹5,00,000 | ₹9,75,000 |

## R&D spend — ledger, not a typed number

`rnd_projects.spent_to_date` was originally hand-typed: the only money in the
system with nothing behind it. It is now maintained by `recalc_project_spend()`
as the sum of that project's live `rnd_expenses` rows, mirroring how `payments`
drives `orders.advance_received`.

```sql
spent_to_date = coalesce((
  select sum(e.amount) from rnd_expenses e
  where e.project_id = target and e.deleted_at is null
), 0)
```

The trigger fires on INSERT, UPDATE **and** DELETE, so an admin soft-deleting
an expense lowers the total.

**Migration note.** The pre-existing typed figures were preserved as explicit
"Opening balance" ledger rows before the trigger could touch them — otherwise
the first real expense on a project would have silently wiped its history.
Verified value-preserving on all three seeded projects:

| Project | spent_to_date | Ledger sum | Match |
|---|---|---|---|
| RND-001 | ₹4,10,000 | ₹4,10,000 | ✅ |
| RND-002 | ₹95,000 | ₹95,000 | ✅ |
| RND-003 | ₹5,12,000 | ₹5,12,000 | ✅ |

Trigger arithmetic tested live: insert ₹25,000 → 4,35,000; soft delete →
4,10,000; hard delete → 4,10,000.

Budget is an **estimate, not a cap**. Expenses that exceed it are warned about
and saved anyway; the budget bar turns amber past 80% and red past 100%.

## Security

- `is_active_member()` and `is_admin()` are `security definer` helpers, so policies read `profiles` without recursing into its own RLS.
- Every table: select/insert/update require an active member; **delete requires admin**.
- `guard_soft_delete()` blocks non-admins from writing `deleted_at` — a soft delete is an UPDATE, so the DELETE policy alone wouldn't cover it.
- `guard_profile_privileges()` blocks staff from changing their own `role` or `is_active`, which the self-update policy would otherwise permit.
- `ip_assets` marked `restricted` are visible only to admins and the owning project's lead, via `can_see_ip()`.
- Trigger functions have `EXECUTE` revoked from `anon` and `authenticated` so they can't be called as REST endpoints. All functions have `search_path` pinned.

### Verified

| Scenario | Result |
|---|---|
| Anonymous (`anon` role) | Blocked on all 13 tables — `anon` cannot even execute `is_active_member()` |
| Signed-in user not in `profiles` | 0 rows |
| Admin | 8 inquiries, 2 orders, 4 IP assets, 3 R&D projects |
| Audit log | 56 rows written automatically |

## Automatic behaviour

- `INQ-`/`ORD-` numbers from sequences on insert
- `updated_at` maintained on every table
- New auth user → `profiles` row created automatically
- Payment insert/update/delete → `orders.advance_received` recalculated
- `ip_events.cost` → `ip_assets.cost_to_date` recalculated
- `work_updates.progress_pct` → parent order/project progress updated
- Follow-up marked done → `done_at` stamped
- Every change on business tables → `activity_log` row

## Alarm panel query

Backed by `followups_pending_due_idx`, a partial index on `coalesce(snoozed_to, due_at) where not is_done`. Seeded state: 3 overdue, 2 due today, 2 in the next 7 days.

IP deadlines come from `ip_assets.next_renewal_date` and `ip_events.due_date`, surfaced at 90/30/7 days and sorted above sales follow-ups.

## Outstanding

- **Leaked password protection is off.** Turn on at Authentication → Policies if you want Supabase to reject passwords found in known breaches. Recommended.
