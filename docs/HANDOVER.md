# Handover Guide — ANK Inquiry Tracking

Everything you need to put this in your client's hands and keep it running.
No code knowledge assumed.

---

## 1. Putting it live

The app needs to live on the internet before anyone can install it. That is
what Vercel does — it runs the app and gives it a web address. It is free at
this size.

**What I need from you first:**

| Thing | Why | Where it goes |
|---|---|---|
| A GitHub account | So the code has a private home Vercel can read from | github.com |
| Supabase **service role** key | Lets the app do admin jobs on the server | **You type it into Vercel yourself** |
| Company logo PNG (optional) | Replaces the "ANK" placeholder icon | Drop it in the folder |

> ⚠️ **Never paste the service role key into this chat, an email, or WhatsApp.**
> It bypasses every security rule in the database. You will paste it directly
> into Vercel's settings screen, where only you can see it.

**The two environment variables Vercel needs:**

```
NEXT_PUBLIC_SUPABASE_URL       https://vozvdtgsinocrohmasvq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  (Supabase → Settings → API → anon public)
```

Both are safe to share: the anon key opens nothing on its own (since the
October 2026 hardening the database grants it no access at all).

**Do not add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.** Nothing in the app uses
it, and a key that bypasses every rule in the database should not sit anywhere
it is not needed.

**Updating it later.** Once it is connected, every change I make gets pushed
and Vercel rebuilds it automatically — usually in under two minutes. Your
client does not reinstall anything and loses no data. The database is
completely separate from the app code, so real records survive every update.

---

## 2. Installing it as an app

Once live, send your client the web address. It installs like this:

**Android (Chrome)**
1. Open the address.
2. A banner offers **Install** — or use ⋮ menu → *Install app*.
3. The ANK icon appears in the app drawer. Opens fullscreen, no browser bars.

**iPhone / iPad (must be Safari)**
1. Open the address in **Safari** — Chrome on iOS cannot install apps.
2. Tap the **Share** button (square with an arrow).
3. Scroll down → **Add to Home Screen** → **Add**.
4. The ANK icon appears on the home screen.

**Windows / Mac (Chrome or Edge)**
1. Open the address.
2. Click the **install icon** in the address bar (a monitor with an arrow), or
   ⋮ menu → *Install*.
3. It gets a Start menu / Applications entry and opens in its own window.

The app also shows its own install prompt on first visit, so most people will
not need these instructions.

---

## 3. Creating staff logins

You chose to manage users from Supabase directly. Here is exactly how.

**To add a staff member:**

1. Go to **Supabase → Authentication → Users → Add user → Create new user**.
2. Enter their email and a temporary password.
3. Tick **Auto Confirm User**. If you skip this they cannot sign in.
4. Under **User Metadata**, add this so their name shows in the app:
   ```json
   { "full_name": "Priya Sharma" }
   ```
   Leave it out and the app will call them `priya` — whatever comes before
   the `@` in their email.
5. Save. Their staff profile is created automatically, **switched off**.
6. In the app, go to **Settings → Staff accounts**. They are listed as
   *Inactive*. If they should see less than everything, give them a role first;
   then press **Activate**. Until an admin does this they cannot get in — so an
   account created by mistake, or by anyone else, opens nothing.

**New users are `staff`, not `admin`.** Staff can do everything day to day.
Only admins can delete records or remove payments. To promote someone, change
their account type from Staff to Admin in **Settings → Staff accounts**.

**To remove someone's access:** **Settings → Staff accounts → Deactivate**. Do
*not* delete the user — deactivating keeps their name attached to the work they
did. They are signed out on their next action.

**To reset a forgotten password:** **Authentication → Users**, find them, ⋮ →
*Reset password*. There is no self-service reset in the app by design.

---

## 4. Before real data goes in — clear the demo records

The app currently holds **made-up data** created for demonstration:
5 companies, 8 inquiries, 2 orders, 3 R&D projects, 4 IP assets and their
follow-ups and payments.

It makes the app look alive during a walkthrough. It becomes a liability the
moment real records sit beside it and someone chases a fake inquiry.

**On go-live day**, run this once in **Supabase → SQL Editor**:

```sql
-- Removes ALL demo records. Staff logins and settings are untouched.
-- There is no undo. Take a backup first if you are unsure:
-- Supabase → Database → Backups.
begin;

delete from public.ip_events;
delete from public.ip_assets;
delete from public.work_updates;
delete from public.rnd_expenses;
delete from public.rnd_projects;
delete from public.payments;
delete from public.orders;
delete from public.followups;
delete from public.inquiries;
delete from public.contacts;
delete from public.companies;
delete from public.activity_log;

-- Restart the numbering so the first real record is INQ-2026-0001.
alter sequence inquiry_no_seq restart with 1;
alter sequence order_no_seq restart with 1;

commit;
```

Order matters — child records go before parents, or the foreign keys reject
it. Run the whole block at once.

---

## 4b. Rotate the database password before go-live

**Required, not optional.**

The Postgres password currently in `.env.local` was shared over chat during
development, so it must be treated as compromised. While the database holds
only demonstration records that costs nothing. The moment real client data is
in there, it matters a great deal — that password grants full read and write
access to everything, bypassing every rule in the application.

1. Supabase → **Connect** → **Direct** → **Reset database password**
2. Generate a new one. Avoid the symbols `@ : / ? # [ ] %` — they must be
   percent-encoded in a connection string and are awkward to debug.
3. Open `C:\inquiry-tracking-system\.env.local` and replace only the password
   inside `SUPABASE_DB_URL`.
4. **Do not send the new password to anyone, in any chat, ever.** Type it
   straight into the file.

Nothing in the live app uses this password — it exists only for applying
database migrations from your machine — so resetting it cannot break the
running system.

## 5. One security setting to switch on

**Supabase → Authentication → Policies → enable leaked password protection.**

It rejects passwords that have appeared in known data breaches. Two clicks,
and worth it for a system holding client commercial data.

---

## 6. What is not built yet

The menu only shows finished screens, so nothing your client clicks will
break. Still missing:

- **IP Portfolio** — renewal deadlines already appear on the dashboard alarm
  panel, but there is no screen to manage the assets themselves.
- **Companies** — client list with contacts and total business value.
- **Reports** — conversion rate, monthly value, payment aging.
- **Settings** — in-app user management (which is why section 3 above uses
  Supabase instead).

None of these block daily use. Inquiries, follow-ups, orders, payments and
R&D all work end to end.

---

## 7. Honest status of testing

- **TypeScript: clean**, 90 source files, zero errors. This catches most
  mistakes before they can happen.
- **Database: verified live.** GST maths, payment totals, R&D spend roll-ups
  and access rules were all tested against the real database, not assumed.
- **Production build: not yet verified.** The sandboxed development
  environment cannot run Next.js's compiler — it crashes at the operating
  system level, unrelated to the code. **The first Vercel deploy is the real
  test.** If it fails the error will be specific and quick to fix, but do not
  schedule the client demo for five minutes after the first deploy.

Deploy first, look at it yourself, then book the demo.
