# Phase 2 — Requirements

Requested by the client's owner after reviewing the working system on 03 Aug 2026.
Seven changes, three of them structural.

Read this before any code is written. Sections 0 and 1 are not optional reading —
they change what is possible and what is legal.

---

## 0. Constraints that shape everything below

### Current plan limits

| | Free plan now | What Phase 2 needs |
|---|---|---|
| Database size | 500 MB | Fine. Text is cheap — this holds hundreds of thousands of rows. |
| **File storage** | **1 GB** | **Blocking.** QA photos and videos do not fit. |
| Egress / month | 5 GB | Tight once media is being viewed repeatedly. |
| Backups | None | Unacceptable once invoices are legal records. |
| Auto-pause | After 7 days idle | Unacceptable for a system in daily use. |

### The storage arithmetic

A phone photo is 3–5 MB. One minute of 1080p video is 60–150 MB. A single QA
check with 5 photos and 2 short videos is roughly **220 MB** — about **four
orders** before the free tier is exhausted.

**Decided by the owner:**

- **Photos are uploaded into the system**, compressed on the way in (longest edge
  1600px, JPEG ~80%) — roughly 300 KB each while staying sharp enough to inspect.
  Even the free 1 GB then holds several thousand.
- **Videos are linked, not uploaded.** Staff record the video, put it on company
  Google Drive, and paste the share link into the QA screen.

Build the video field to accept **either** a link or an upload, switched by
`MEDIA_UPLOAD_ENABLED` (default `false`). The day the plan is upgraded, the
switch flips — no rebuild, no migration.

> Recorded so nobody is surprised later: linked video is a cost decision, not a
> design one. QA media exists as evidence in a dispute. A link breaks if the file
> is moved or deleted, obeys Google Drive's permissions rather than this system's,
> and cannot be embedded in a PDF — only referenced. Photos, which are stored
> properly, carry the evidential weight.
>
> **Operational rule to give staff:** put QA videos in a dedicated Drive folder
> that only managers can delete from, and never move or rename them.

### Licensing — needs resolving

**Vercel's Hobby plan is non-commercial only.** Their fair-use terms define
commercial as any deployment "used for the purpose of financial gain of anyone
involved in any part of the production of the project, including a paid employee
or consultant writing the code." An internal business system built as paid work
is commercial use. It runs today; it is outside the terms.

**Realistic monthly cost to support Phase 2:** Vercel Pro $20 + Supabase Pro $25
≈ **$45/month (~₹3,800)**. Supabase Pro also brings 100 GB storage, daily
backups and no auto-pausing — all three of which Phase 2 needs regardless.

---

## 1. Decisions required before building

These cannot be guessed. Invoicing in particular is a legal document, and a
wrong assumption produces invoices that are not valid.

| # | Question | Why it blocks |
|---|---|---|
| 1 | ANK's **GSTIN** and **registered state** | Determines CGST+SGST vs IGST on every invoice |
| 2 | Are they **GST-registered under the regular scheme**? | Composition dealers cannot issue tax invoices |
| 3 | **HSN/SAC codes** for what they sell | Legally required on tax invoices |
| 4 | Invoice **series prefixes and starting numbers** for each document type | Must be unique, sequential, gapless, per financial year |
| 5 | Is a **digital signature** on the PDF required, or is a name and designation enough? | Affects PDF generation |
| 6 | Do they want **OQ** as well as DQ, IQ and PQ? | The standard sequence is DQ → IQ → OQ → PQ; the owner named only three |
| 7 | Which orders need qualification documents — **all, or equipment only**? | Decides whether it is a flag per order |
| 8 | **Confirm the school / GST instruction with a CA.** See 3.2.1. | Affects whether invoices are legally correct |

### Volume — smaller than it looks

The owner expects **5–10 invoices a month**. This matters: the invoicing module
does not need to be industrial. No bulk generation, no scheduled runs, no
import/export pipelines. Correctness and legal validity matter enormously;
throughput does not matter at all.

It also settles a question worth asking out loud — at that volume, dedicated
accounting software is hard to justify, which is exactly why this belongs in
the system the orders already live in.

---

## 2. The structural problem, stated plainly

**Orders currently have no line items.** An order is a single `order_value`
with GST at a flat 18%.

A legal Indian tax invoice must show, per line: description, HSN/SAC code,
quantity, unit, rate, taxable value, and the tax split. It also needs place of
supply, and CGST+SGST for an in-state sale versus IGST for an interstate one.

So invoicing cannot be added on top of the current model. Order line items must
be introduced first, and everything else in this document depends on that.

**Design decision.** Do *not* change the generated columns on `orders`. Instead:

- `order_items` becomes the source of truth for `order_value`, maintained by
  trigger — exactly the pattern already proven by `payments → advance_received`
  and `rnd_expenses → spent_to_date`.
- The **CGST/SGST/IGST split is computed on the invoice, not the order**, because
  it depends on the client's state, which lives on another table. Generated
  columns cannot reach across tables; the invoice can.

**Migration safety.** The two existing orders must each receive a single line
item carrying their current value *before* the trigger goes live — the same
"opening balance" technique used for R&D spend. Verify the totals match to the
paisa afterwards, exactly as was done then.

---

## 3. Feature specifications

### 3.1 Order line items  *(build first — everything depends on it)*

**New table `order_items`:** `order_id`, `line_no`, `description`, `hsn_sac`,
`quantity numeric(12,3)`, `unit` (nos/set/kg/m/hour/lot), `rate numeric(14,2)`,
`amount` generated as `round(quantity * rate, 2)`, `notes`, soft delete.

**Trigger** `recalc_order_value()` sums live items into `orders.order_value`.
Fires on insert, update **and** delete; excludes soft-deleted rows.

**UI:** an editable line-item table on the order detail screen, above Financials.
Add / edit / remove lines. `order_value` becomes read-only everywhere and joins
the "auto-calculated" group with a padlock.

**Acceptance:** changing a quantity updates the order value, the GST, the total
and the balance with no further action.

---

### 3.2 Invoicing and documents

Five document types. Only two of them are tax documents.

| Type | Tax document | Numbering series | Notes |
|---|---|---|---|
| Proforma invoice | No | `PI/2026-27/0001` | A quotation-style document. Creates no GST liability. Must be clearly labelled "Proforma Invoice — not a tax invoice". |
| Tax invoice | **Yes** | `INV/2026-27/0001` | Full legal requirements below. |
| Bill of supply | No | `BOS/2026-27/0001` | For clients flagged `gst_applicable = false` — see 3.2.1. |
| Delivery challan | No | `DC/2026-27/0001` | Accompanies goods. Shows quantities, not necessarily tax. |
| Credit note | **Yes** | `CN/2026-27/0001` | Reduces value — returns, rate reduction, deficiency. Must reference the original invoice. |
| Debit note | **Yes** | `DN/2026-27/0001` | Increases value. Must reference the original invoice. |

#### 3.2.1 Schools without GST — implement, but verify first

The owner has asked that **schools are not invoiced with GST**.

Build it as a per-client switch, not a rule about the word "school":

- New column `companies.gst_applicable boolean not null default true`.
- When `false`, the client cannot be issued a **Tax invoice**, **Credit note** or
  **Debit note**. They get a **Bill of supply** (new sixth document type,
  series `BOS/2026-27/0001`), a proforma, or a delivery challan.
- A bill of supply shows no tax columns and must carry the line
  *"Not a tax invoice — no GST charged on this supply."*
- The reason for the exemption is stored as free text on the company record,
  so an auditor can be answered years later.
- Reports separate taxable from non-taxable turnover.

> **Flag this to the owner before the first invoice is raised.**
>
> Under GST, whether tax is charged depends on **what is being supplied and
> whether the supplier is registered** — not on whether the customer holds a
> GSTIN. A registered supplier selling taxable goods to an unregistered school
> normally still charges GST; it is simply a B2C sale. The exemptions that exist
> for educational institutions are narrow and mostly cover services *to* schools
> such as transport, catering and security, not general equipment supply.
>
> There may well be a sound reason for this instruction — exempt supplies, a
> different billing entity, or something specific to their contracts. But it is
> a tax position, not a software preference, and getting it wrong creates a
> liability that lands on ANK rather than on this system.
>
> **Have their CA confirm it in writing, then build it.** The switch above works
> either way; only the default changes.

**A tax invoice must carry:** supplier name, address and GSTIN · invoice number
and date · recipient name, address and GSTIN · **place of supply** · per line:
description, HSN/SAC, quantity, unit, rate, taxable value · tax rate and amount
split as **CGST+SGST** (supplier state = place of supply) or **IGST** (otherwise)
· total tax · grand total in figures **and words** · signature or authorised
signatory block.

**Copies.** The standard Indian convention for goods, printed as a label on each copy:

- Original for Recipient
- Duplicate for Transporter
- Triplicate for Supplier

The PDF export offers: single copy, all three copies, or a chosen subset.

**Numbering rules — non-negotiable:**

- Unique, sequential, **no gaps**, per series, per financial year (Apr–Mar).
- Maximum 16 characters; letters, digits, `/` and `-` only.
- Generated by a database sequence at the moment of issue, never by the app.
- **An issued tax invoice is immutable.** Corrections happen via credit or debit
  note. Allow a `draft` state that can be edited, and `issued` which cannot.

**New tables:** `invoices` (type, series, number, date, order_id, place_of_supply,
supplier snapshot, buyer snapshot, status draft/issued/cancelled, reference to
parent invoice for CN/DN, totals) and `invoice_lines` (snapshot of the order
items at issue time — an invoice must not change when someone later edits the order).

**Snapshotting is the important part.** Copy the values onto the invoice at
issue. Never render an invoice by joining live data.

---

### 3.3 QA / QC gate before dispatch

**Rule:** an order cannot move to `dispatched`, `delivered` or `closed` until a
QA check exists with `result = 'pass'`. Enforced by a database trigger, not only
by the UI — the UI merely explains why the option is unavailable.

**New table `qa_checks`:** `order_id`, `checked_on`, `checked_by`,
`result` (pass / fail / conditional_pass), `report_no`, `description` (required),
`observations`, `conditions` (required when result is conditional_pass),
`approved_by`, `approved_at`.

**New table `qa_media`:** `qa_check_id`, `kind` (photo / video), `storage_path`
(uploaded) **or** `external_url` (linked), `caption`, `uploaded_by`. Exactly one
of the two location fields must be set — enforce with a check constraint.

**Mandatory before a QA check may be marked passed:**
description, at least **one photo** (uploaded), and at least **one video**
(a link, per the storage decision in section 0). Enforced in the database, not
only in the form.

**UI:** a QA section on the order detail screen, between Work updates and
Delivery. Photo thumbnails in a grid, click to enlarge. The Delivery status
dropdown shows dispatch options greyed out with the reason until QA passes.

**Photos are compressed client-side before upload.** Longest edge 1600px, JPEG
quality 80.

---

### 3.4 Qualification documents (DQ / IQ / OQ / PQ)

These are commissioning and handover records, not dispatch records. They belong
to the order and run across its life:

| Stage | Full name | When |
|---|---|---|
| **DQ** | Design Qualification | Before manufacture — the design meets the requirement |
| **IQ** | Installation Qualification | At site, after delivery — installed correctly |
| **OQ** | Operational Qualification | After installation — operates through its range |
| **PQ** | Performance Qualification | In production use — performs consistently |

> The owner named IQ, PQ and DQ. **OQ is the standard fourth** and normally sits
> between IQ and PQ. Confirm before building — leaving it out of a validation
> set is unusual and clients in regulated industries will ask.

**New table `qualifications`:** `order_id`, `stage` (dq/iq/oq/pq),
`status` (not_started / in_progress / passed / failed), `planned_date`,
`performed_on`, `performed_by`, `customer_representative`, `customer_signed_off`
bool, `signed_off_on`, `summary`, `document_path` (uploaded PDF), `notes`.
Unique on `(order_id, stage)`.

**UI:** a four-step tracker on the order detail screen. Each stage expands to
show detail, an attachment, and a sign-off. `orders.requires_qualification` flag
controls whether the section appears at all — decision #7 above.

**Do not gate dispatch on qualification.** DQ may precede dispatch, but IQ, OQ
and PQ happen at the client's site afterwards. Gating dispatch on them would
make dispatch impossible.

---

### 3.5 Minutes of meeting

**New table `meetings`:** `meeting_date`, `meeting_type` (site_visit / review /
kickoff / handover / other), `location`, `company_id`, optional `inquiry_id`
and `order_id`, `internal_attendees text[]`, `client_attendees text[]`, `agenda`,
`discussion`, `decisions`, `next_steps`, `created_by`.

**New table `meeting_actions`:** `meeting_id`, `action`, `owner_id`, `due_on`,
`is_done`, plus optional `followup_id`.

**The valuable part:** an action item with an owner and a due date
**automatically creates a follow-up**, so it appears on the dashboard alarm
panel. A minute that lives only in a document is a minute nobody reads. This is
what makes MOM worth building rather than filing.

**UI:** a Meetings section on company, inquiry and order detail screens, plus a
Meetings entry in the main menu. Exportable as PDF.

---

### 3.6 Recent changes, who did what, and exact times

The owner's scenario: someone makes a change that shouldn't have been made —
how does anyone else find out?

Everything needed is already captured. `activity_log` records every create,
edit and delete with the actor and a diff. **It is invisible to staff**, because
the table is admin-read-only, and nothing renders it.

**Changes required:**

1. **Add `summary text`** to `activity_log`, written by the existing trigger in
   plain language: *"Order ORD-2026-0002 status changed from In Production to
   Dispatched"*, *"Payment of ₹1,00,000 recorded on ORD-2026-0002"*.
2. **Add `note text`** — an optional reason typed by the person making the
   change. Prompt for it on high-impact edits: order value, status changes,
   payment removal, deletions.
3. **Expose it safely.** Do not simply open `activity_log` to all staff — its
   diffs can contain restricted IP data. Create a `security definer` view that
   returns `summary`, `note`, actor, table, row and timestamp, filtered to
   exclude rows relating to restricted IP assets the viewer cannot see. Staff
   read the view; admins keep full diff access.
4. **New screen `/activity`** — reverse-chronological feed, filterable by person,
   by section and by date, with a "changes in the last 24 hours" default.
5. **Add a "Recent changes" strip to the dashboard** — the five most recent, with
   a link to the full feed.

**Timestamps — fix properly.** Currently rendered in whatever timezone the
device happens to be in, and shown only as a relative phrase in places.

- Store UTC (already correct — no change).
- **Display in `Asia/Kolkata`, explicitly labelled**, everywhere.
- Show both: `03 Aug 2026, 12:25 PM IST` with `(5 hours ago)` beside it. Absolute
  time is what an audit needs; relative time is what a human reads quickly.
- Apply to the activity feed, both timelines, follow-ups, payments and work updates.

---

### 3.7 Convert to order — field changes

Replace the free-text **Notes** field in the convert dialog with:

1. **Technical specification** — required, textarea, minimum ~20 characters.
   Validated on the client and re-validated on the server. This is what was
   agreed and what production will build to.
2. **Addendum / changes** — optional, below it. For variations agreed after the
   original specification.

Both are stored on `orders`, both remain editable on the order detail screen,
and **every edit to either must be recorded in the activity log with a note** —
these are exactly the fields where a silent change causes an argument later.

Existing orders: back-fill `technical_specification` from the current `notes`
value where present, and keep `notes` for general remarks.

---

### 3.8 Dashboard layout

Swap the two panels: **Recent inquiries on the left, Follow-up alarms on the right.**

> Recorded for the record: the alarm panel was placed left deliberately, because
> it is the feature that stops inquiries being lost and the left column is read
> first. The owner has asked for the swap and it is his system. Worth explaining
> the original reasoning to him once; if he still prefers the swap, keep it.

Keep the alarm panel visually dominant — red header, larger tap targets — so
prominence is not lost entirely with position.

---

## 4. Suggested build order

Each phase ends with a working, deployable system.

| Phase | Contents | Why this order |
|---|---|---|
| **2A** | Activity feed, `summary` and `note` columns, IST timestamps, dashboard swap, convert-to-order fields | No new storage, no new money, immediate visible value. Also gives an audit trail *before* riskier changes are made. |
| **2B** | Order line items + migration | Everything below depends on it. Highest risk — do it alone, verify totals. |
| **2C** | Invoicing: 6 document types, numbering, PDF, copies | The largest single piece. Needs decisions 1–5 and 8. |
| **2D** | QA/QC gate + media | Photos uploaded, videos linked — decided. |
| **2E** | Qualification documents | Self-contained. |
| **2F** | Meetings and MOM | Self-contained; ties into follow-ups. |

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Line-item migration corrupts the two existing orders | Insert opening line items **before** enabling the trigger; verify sums match to the paisa; take a backup first |
| Invoice numbering develops gaps | Database sequence, allocated only at issue; never renumber; cancel rather than delete |
| An issued invoice changes because the order changed later | Snapshot lines onto the invoice at issue; never render from live data |
| Free storage fills silently mid-use | Compress photos; monitor usage; upgrade before enabling video upload |
| Opening the activity log leaks restricted IP | Expose via a filtered `security definer` view, never the raw table |
| Dispatch blocked by QA in a genuine emergency | Allow admin override, which itself writes a prominent activity-log entry with a mandatory reason |
