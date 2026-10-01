# ANK Track — security review and hardening, 1 October 2026

Everything below is on the branch **`security-hardening`**. Nothing has been
deployed and no database change has been applied: the live system is exactly
as it was. The branch is for the team to review, test and then put live.

## In one paragraph

The system was already built carefully — every table has row level security,
the server never trusts the browser, and nobody outside could read business
data. The review found the places where that care stopped short: a critical
hole in the Next.js version in use, the partner's signature downloadable by
anyone, custom roles that only hid menu items while the database still handed
every row to every login, and API paths that let any staff login forge an
issued invoice or rewrite the totals. All of those are fixed on the branch,
proven on a copy of the real data inside transactions that were rolled back,
and listed here with how to apply them and how to undo them.

## What was checked

- Every file in `src/`: pages, layouts, server actions, queries, the
  middleware, the Supabase clients, the service worker and the PWA files.
- The live database, read only: tables, row level security policies, column
  and table privileges, every function and trigger, storage buckets and
  policies, default privileges, and the Supabase security and performance
  advisors.
- The live site from outside, signed out, the way an attacker starts: response
  headers, every public path, the database API with the public key, the
  storage API, the image optimiser, old deployment URLs.
- The live site signed in (as the owner's admin account, reading only), its
  network traffic and what reaches the browser.
- Supabase Auth settings (sign-up, providers, password rules, rate limits,
  MFA, redirect URLs), Vercel project protection and environment variables
  (names only — no secret was read), the git history for leaked secrets, and
  the dependencies against the public vulnerability database.

## Findings and fixes

Severity is about what an attacker could do, not how likely it is.

### Critical and high

| # | Finding | Fixed by |
|---|---|---|
| C1 | **Next.js 15.5.22 has published critical vulnerabilities**, including remote code execution through the image optimiser at `/_next/image` — which was publicly reachable without signing in (it answered `200` on the live site). | Upgraded to **15.5.27** (`package.json`), and the optimiser is switched off (`images.unoptimized` in `next.config.mjs`) because nothing uses it — the endpoint now answers 404. |
| H1 | **The partner's handwritten signature was downloadable by anyone** at `/signature.png`, no login needed. | The file moved to `src/assets/` and is served by `src/app/assets/signature/route.ts` only to a signed-in user who may open Documents, with `no-store`. Anyone else gets the login page or a 404. Old deployment URLs are already behind Vercel's login. |
| H2 | **Custom roles were cosmetic.** A role hid menu items, but every policy only asked "is this an active account?". The real "Staff" login (dashboard only) could read every payment, invoice, order line price, R&D budget, meeting and the company's bank details straight from the database API, and could create and issue quotations through it (burning numbers). | `20261001_8_03_enforce_roles_in_database.sql`: the policies now ask what the screens ask, through `has_feature()`, which mirrors the app's own permission logic exactly. Accounts with no role (every admin today) keep everything; the document functions check the Documents feature themselves. |
| H3 | **Any staff login could forge records through the API** — the browser holds everything needed. Examples: set a draft invoice to "issued" with any number, insert an "issued" tax invoice outright, renumber an inquiry or order, overwrite an order's received amount or tax, forge an admin's QA override or a QA approval, change a technical specification with no reason recorded. | `20261001_8_02_protect_system_columns.sql`: staff may write only the columns the app writes (listed per server action); numbers, totals, approvals and every column of `invoices` are written only by the database's own functions. `update_order_spec()` became the only way to change a specification. |
| H4 | **The public (anon) key held full rights on almost every table** — select, insert, update, delete, even truncate — so a single mistaken policy anywhere would have exposed that table to the internet. 14 database functions were callable without signing in, one of which writes to orders. Every new table or function would have inherited the same. | `20261001_8_01_close_anonymous_access.sql`: the anon role now holds nothing in the business schema, functions are granted only to signed-in staff and only where used, and the defaults no longer re-grant anything to anon. |
| H5 | **Open redirect after login.** `/login?next=/\evil.example` or `?next=/..//evil.example` passed the check and sent the user to another site the moment they signed in — a ready-made phishing link that starts on the real login page. | `safeNext()` in `src/app/login/actions.ts` now parses the target the way a browser does and refuses anything that leaves the site. 17 bypass patterns tested against the real function. |
| H6 | **The session cookie was readable by page scripts and there was no Content-Security-Policy.** One script injection anywhere would have let the attacker copy the session and use it from anywhere. | Session cookies are now `httpOnly` (`src/lib/supabase/cookies.ts`); a strict nonce-based CSP and the full set of security headers are sent on every page (`src/lib/supabase/middleware.ts`, `next.config.mjs`). The browser no longer carries any Supabase client: QA photos go up through a one-off signed upload URL issued by the server. |

### Medium

| # | Finding | Fixed by |
|---|---|---|
| M1 | QA evidence could be faked: a "photo" row pointing at a file that was never uploaded (or another order's), and a "video" link of `javascript:…`, would satisfy the dispatch gate. | `20261001_8_05_qa_evidence_must_be_real.sql` checks the file exists under this order and check, and that video links are http(s); the form and the server action check the same. |
| M2 | A new sign-in started as an active member with access to every screen. Safe today only because public sign-up is off. | `20261001_8_04_new_accounts_start_inactive.sql`: new accounts start inactive; an admin presses **Activate** in Settings (instructions updated in the app and in `docs/HANDOVER.md`). |
| M3 | A settings manager who is not an admin saw "Account updated" while the database silently changed nothing. | Account changes now require an admin, report a real failure, and the controls are disabled for non-admins. |
| M4 | Raw database errors (for a malformed id) could reach the screen. | Document, QA and meeting actions validate ids first. |

### Bugs, glitches and speed

- **Dashboard hydration error / phone taps**: the recent-inquiry cards were a link containing phone and email links (invalid HTML; on a phone, tapping a number could open the inquiry). Fixed in `recent-inquiries.tsx`.
- **No way back for restricted users**: a role without the Dashboard had no menu entry to its My work page. A **My work** item now appears for them.
- **GST rates**: the quick picks still offered 12% and 28%, abolished by GST 2.0 on 22 Sep 2025. Now 0 / 5 / 18 / 40; lines already at another rate keep it.
- **State drop-downs** listed codes 10–97 before 01–09. Now in code order.
- **Duplicate-company check** treated `%` and `_` in a name as wildcards. Escaped.
- **Removed QA photos** left the file behind; it is now removed where the bucket allows (admins).
- `created_by` was missing on clients created from the Companies screen and on contacts added while editing an inquiry.
- **Faster pages**: detail pages (orders, inquiries, documents, companies, IP, R&D, meetings) loaded their whole record twice per visit — once for the tab title — now once. The signed-in check ran up to four times per page, each a round trip to Supabase Auth — now once. The order page's JavaScript fell from 217 KB to 154 KB. Policy checks run once per query instead of once per row, and a duplicate index on the audit log is dropped (`20261001_8_06`).
- The Settings page now loads its data in parallel.
- Leftovers of the deleted Pro/Lite editions were removed from `.gitignore` and `tsconfig.json`.

Found by the signed-in test on 1 October (see the end of this document) and
fixed in the last commit:

- **Removing an action from meeting minutes left its follow-up behind**: the
  owner kept being reminded on the dashboard about an action that no longer
  existed. `20261001_8_07` makes the open follow-up go with the action; one
  already done stays as history.
- **Snoozing a follow-up that was not due yet pulled it forward**: due in three
  days, "1d" made it due tomorrow. Snooze now counts from now only when the
  follow-up is already due, otherwise from its own time.
- **Back after saving a form reopened the form**: after recording minutes, Back
  said "Back to the meeting" and led to a blank New minutes page. Back now skips
  forms and returns to where you were before them.
- Half the pages titled the browser tab "… · Inquiry Tracking System", the
  other half "… · ANK Inquiry Tracking"; all now use the app's name. "1 line
  still have no HSN/SAC code" now reads "has". Clearing an empty addendum no
  longer logs "changed: addendum" in Recent changes.

## Not changed — needs a decision or an account setting

These are outside the code, or cost money, so they are for the owner:

1. **Supabase is on the Free plan**: no automatic backups (issued tax invoices
   live here), no leaked-password check, no session time-outs. Upgrade the
   organisation to Pro, or at minimum take a regular `pg_dump` off-site.
   **Take a backup before applying the migrations.**
2. **Supabase Auth → URL Configuration → Site URL is `http://localhost:3000`.**
   Set it to `https://ank-its.vercel.app`. Password-reset emails go to this
   address.
3. **Password reset does not complete today**: the reset email lands on the
   Site URL with nothing in the app to receive it. Fixing it needs a small
   `/auth/confirm` route, a "set a new password" page and a change to the reset
   email template — recommended as the next piece of work. Until then an admin
   has to help a locked-out user.
4. **Vercel is on Hobby**, which is for non-commercial use. Upgrade the team to
   Pro, then add a Firewall rate-limit rule: path `/login`, method `POST`,
   about 10 requests per minute per IP. (Sign-in runs on the server, so
   Supabase's own per-IP limit sees Vercel's address rather than the
   attacker's.)
5. **The Vercel projects `inquiry-tracking-system-pro` and
   `inquiry-tracking-system-lite` still exist and are publicly reachable**,
   each with a Supabase service-role key stored (for a different, paused
   Supabase project — not the ANK data). If those editions are gone, delete
   both projects in Vercel, and the paused Supabase project "Dev010904's
   Project" if nothing uses it.
6. **Two-step login (MFA) for admins**: Supabase already allows authenticator
   apps; the app needs an enrolment screen and a code prompt at login. Worth
   doing — four of the five accounts are admins.
7. Turn on two-factor authentication for the GitHub, Vercel and Supabase
   accounts themselves; whoever holds those holds everything.
8. Next.js still ships an old PostCSS internally (a build-time issue only, not
   reachable from the site). It clears when the app moves to Next.js 16.

## How to put this live

Either order of steps 3 and 4 is safe. The old code works on the new database —
run 1 below replays its writes column by column, and its photo paths already
satisfy 8_05 — and the new code only adds writes the old database allows
(`created_by` on two inserts, a returned id after account changes, a signed
upload URL that the current storage policy already permits).

1. **Review** the branch: `git diff main...security-hardening`.
2. **Back up** the database (see point 1 above).
3. **Apply the migrations** in the Supabase SQL editor, one file at a time, in
   order: `20261001_8_01` → `8_02` → `8_03` → `8_04` → `8_05` → `8_06` →
   `8_07`. Run the verification queries at the bottom of each file. Each file
   says how to undo it. `8_07` must come after `8_02`.
4. **Deploy the code**: merge `security-hardening` into `main`; Vercel builds
   it.
5. **Account settings**: Site URL (point 2), and points 4–5 when decided.
6. **Test** with the checklist below.

## Checklist for the team after it is live

Signed in as an admin:

- [ ] Dashboard, Inquiries, Orders, Documents, Companies, Meetings, R&D, IP,
      Recent changes, Reports, Ledger and Settings all open and show the same
      data as before.
- [ ] Create a test inquiry, convert it to an order, add a line, record and
      remove a payment (then delete the test records as usual).
- [ ] On an order: record a QA check, **attach a photo**, add a video link,
      remove both. (The photo upload is the one flow whose mechanism changed.)
- [ ] Open a document: the printed preview shows the signature.
- [ ] Raise a quotation draft, add a line, change its terms. Do **not** issue a
      test document — issuing uses a real number.
- [ ] Settings: the staff list shows; changing a person's role works.
- [ ] Sign out, and open `https://ank-its.vercel.app/assets/signature` —
      you are sent to the login page.

Signed in as the **Staff** role account (dashboard only):

- [ ] The dashboard shows alarms, KPIs, recent inquiries and recent changes,
      and a follow-up can be ticked off or snoozed.
- [ ] Recent changes on the dashboard show only inquiry, follow-up, company and
      contact changes — no payments or documents.

From outside (no login):

- [ ] `https://ank-its.vercel.app/signature.png` → 404.
- [ ] `https://ank-its.vercel.app/_next/image?url=%2Fprint-logo.png&w=64&q=75`
      → 404.

## How it was tested before handing over

No test touched the live data. Each database test applied the migration and
ran the checks inside one transaction that ended by raising an error, so
Postgres rolled everything back; the counters, row counts and a checksum of
every order's money were compared before and after and were identical.

**Run 1 — 8_01 and 8_02, as a signed-in admin (52 checks, all passed).**
Every write the app makes was replayed with its exact columns: companies,
contacts, inquiries (number still allocated: INQ-2026-0021 in the rolled-back
run), follow-ups, convert to order, order details, specification with reason,
order lines, payments, QA checks and evidence, qualifications (upsert), work
updates, tasks (create, status, notes, reassign, delete), meetings and actions,
R&D projects and expenses, IP assets and events, profiles, roles and role
permissions (upsert), company settings, and the whole document path — create a
quotation, add and edit lines, terms, issue it, accept it into an order,
duplicate, delete a draft, cancel, the number register, raise a proforma. All
20 forgery attempts failed with "permission denied", including issuing an
invoice directly, inserting one, renumbering, editing totals, forging approvals
and editing the specification without a reason. Signed out, every table and
function was refused; no function remained callable by anon.

**Run 2 — 8_03, role by role.** The ten rewritten database functions were
compared with the live ones and differ only in their permission line (10/10).
An admin with no role saw exactly every row the owner sees. The real Staff
role saw its dashboard data and **zero** payments, invoices, invoice lines,
order lines, company settings, QA, R&D, meetings and work updates, could
snooze a follow-up, and was refused when creating an inquiry, a quotation or a
specification change. Made-up roles behaved as designed: *Orders only* could
work its orders but not raise documents or touch R&D; *Documents only* could
raise a quotation; a role with no features at all saw only its own follow-up
and task and the inquiry, company and order they hang off.

**Run 3 — 8_04 to 8_06.** New profiles default to inactive while the existing
five stay active; QA evidence with a made-up path, a missing file, `..`, a
`javascript:` link or a linked photo was refused, a real photo and an https
video link were accepted; the duplicate index dropped and the one in use
stayed.

**The application.** Type check, lint and production build pass. The
production build was run locally and checked signed out: every page carries
the new headers and a CSP whose nonce is on all 44 scripts of the login page,
the page hydrates with no CSP violations and the service worker still
registers; `/signature.png` and `/_next/image` answer 404 and
`/assets/signature` redirects to the login page.

**Run 4 — 8_07.** Inside a rolled-back transaction, as the admin: an action
with an owner and a due date created its follow-up; removing the action
removed the follow-up, and the removal was audited; an action marked done kept
its done follow-up when removed; staff cannot call the new function. The
trigger and function were confirmed absent afterwards.

**Run 5 — signed in, on the live data, 1 October 2026, 12:36–13:20 UTC.** The
owner signed in to the new build running locally (`next start`), which talks to
the live database — still without the migrations, which is the state the system
is in if the code goes live before them. A checksum of every row of 27 tables
(the change log included), both counter tables and the photo storage was taken
first.

- All 28 screens opened with no errors and no CSP violations in the console;
  every script carried the nonce; the session cookie was invisible to
  JavaScript; nothing about the session was in local or session storage; the
  service worker cached only the offline page and icons. The signature loaded on
  an issued quotation and a tax invoice, and was served `private, no-store`.
  Dashboard, inquiries, an inquiry, companies and a client were also checked at
  phone width (390 px): no sideways scrolling, bottom bar present, no link
  inside a link. The browser would not stay at phone width for the remaining
  screens.
- With records named "ZZ TEST": a client, a case-insensitive duplicate refused,
  a name differing only where `_` stood accepted (the escape fix), a contact, an
  inquiry with its follow-up (INQ-2026-0021), "Lost" without a reason refused,
  status to Quoted, a quotation draft with a line (GST picks 0/5/18/40, states in
  code order), terms, preview with signature, then deleted — no number used;
  convert to order (ORD-2026-0010), an order line, a payment recorded and
  removed, the specification changed with its reason logged, Dispatched refused
  without QA, delivery details, a work update, pending work set to done,
  qualification on and off, a QA check with a photo uploaded through the new
  signed upload, a `javascript:` link refused, an https link accepted, both
  removed (the photo file went from storage too), meeting minutes with an action
  and a follow-up, and follow-up snooze and done. The problems listed under
  "Found by the signed-in test" were found here, fixed, rebuilt and re-checked
  on the same records.
- Every test record was then deleted and the counters returned to 20 and 9
  (no real record had taken a later number). The checksums of all 30 items
  matched the ones taken before, so the live data is exactly as it was.
- Sign out returned to the login page; afterwards the dashboard, an order and
  `/assets/signature` each sent the browser to the login page with the right
  return path.

Still to do after it goes live: the checklist above, and in particular the
Staff role account, which this test did not sign in as.

## Undoing it

- **Code**: revert the merge commit; Vercel redeploys the previous version.
- **Database**: each migration file ends with its own rollback. They are
  independent, so one can be undone without the others — e.g. if a screen
  fails with "permission denied for table X", the quickest restore is the
  rollback block at the end of 8_02, and the proper fix is to add the missing
  column to that file's grants. The one exception: undo 8_07 before (or
  together with) 8_02, since 8_07 relies on 8_02.
