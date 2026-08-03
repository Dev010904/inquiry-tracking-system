# Addendum — IP Tracking for R&D Projects

> Amendment to the original brief, agreed before the Phase 1 migrations were written.

R&D projects generate intellectual property. The system must track it, linked to the project that produced it.

### New table: `ip_assets`

| Column | Notes |
|---|---|
| id | uuid PK |
| rnd_project_id | FK → `rnd_projects`, **nullable** (some IP predates or sits outside a project) |
| title | text, required |
| ip_type | enum: `patent` \| `design` \| `trademark` \| `copyright` \| `trade_secret` \| `know_how` |
| protection_route | enum: `provisional` \| `complete` \| `pct` \| `national_phase` \| `unregistered` — nullable, mainly for patents |
| application_no | text, nullable (blank until filed) |
| registration_no | text, nullable (granted number) |
| jurisdiction | text, default `IN` |
| status | enum: `idea` \| `disclosure_filed` \| `drafting` \| `filed` \| `published` \| `under_examination` \| `granted` \| `refused` \| `abandoned` \| `lapsed` |
| filing_date, publication_date, grant_date, expiry_date | date, all nullable |
| next_renewal_date | date, nullable — **feeds the follow-up alarm panel** |
| inventors | text[] or a join table to `profiles` + free-text external names |
| owner_entity | text, default company name |
| attorney_firm, attorney_contact | text |
| cost_to_date | numeric(14,2) default 0 |
| confidentiality | enum: `public` \| `internal` \| `restricted` — default `restricted` |
| notes | text |
| deleted_at | soft delete, admin-only |

### Supporting pieces

- **`ip_events`** — dated log per IP asset: event_date, event_type (`filed`, `office_action`, `response_filed`, `fee_paid`, `renewed`, `assigned`…), note, author_id, cost. Reuse the same feed UI as `work_updates`.
- **`ip_documents`** — optional Phase 7: Supabase Storage file refs (specification PDF, forms, certificates), private bucket, RLS-gated.

### Alarm integration (important)

IP deadlines are the highest-stakes dates in the system — a missed patent renewal is unrecoverable. The dashboard follow-up panel must merge two sources:

1. `followups.due_at` (inquiries)
2. `ip_assets.next_renewal_date` **and** any `ip_events` with a due date

Render IP deadlines with a distinct icon/colour and a longer lead time — surface them at **90 / 30 / 7 days** out, not just 7. Overdue IP items sort above overdue follow-ups.

### UI changes

- **`/rnd/[id]`** — add an **IP** tab: linked IP assets as cards (type badge, status pill, application/registration no, key dates, cost), plus "Add IP asset".
- **`/ip`** — new top-level list: title, type, status, project, application no, filing date, next renewal, cost. Filters by type/status/jurisdiction. Rows red when a renewal is overdue, amber within 30 days.
- **`/ip/[id]`** — detail: full record, inventor list, cost roll-up, and the `ip_events` timeline.
- **`/rnd`** list — add an "IP" count column per project.
- **`/reports`** — IP portfolio summary: count by type and status, total IP spend, renewals due in the next 12 months.

### Access rules

IP is the most sensitive data here. Rows with `confidentiality = 'restricted'` are readable by `admin` and the project `lead_id` only — add that condition to the `ip_assets` and `ip_events` select policies. Everything else follows the standard active-member policy.

### Roll-ups

`rnd_projects.spent_to_date` should show R&D spend and IP spend separately (or as a labelled subtotal), so budget-vs-spent stays meaningful.
