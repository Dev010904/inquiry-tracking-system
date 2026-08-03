# Deploy Guide — getting the app online

Written for someone who has not used GitHub or Vercel before. Roughly 20
minutes end to end. Everything here is free at your size.

Your folder is already prepared: the code is committed, and the file holding
your keys (`.env.local`) is excluded so it can never be uploaded by accident.

---

## Step 1 — GitHub account (2 min)

GitHub is where the code is stored, privately.

1. Go to **github.com** → **Sign up**.
2. Use your work email, pick a username, verify the email.
3. Free plan is fine. Private repositories are included.

**Tell me your username once you have it** — I need it for the next step.

---

## Step 2 — GitHub Desktop (5 min)

This is the app that uploads your code. No typing commands.

1. Download from **desktop.github.com**, install, and sign in with the account
   from Step 1.
2. **File → Add local repository**.
3. Choose the folder `C:\inquiry-tracking-system`.
4. It will say the repository has commits ready. Click **Publish repository**.
5. **⚠️ Make sure "Keep this code private" is ticked.** This is the one setting
   that matters. It is ticked by default — just confirm before clicking.
6. Click **Publish repository**.

Your code is now backed up and private. Nobody but you can see it.

---

## Step 3 — Vercel (5 min)

Vercel runs the app and gives it a web address.

1. Go to **vercel.com** → **Sign up** → **Continue with GitHub**. This links
   the two accounts, so Vercel can read your private repo.
2. On the dashboard, click **Add New… → Project**.
3. Find `inquiry-tracking-system` in the list → **Import**.
4. Vercel detects Next.js on its own. **Do not change the build settings.**
5. Before clicking Deploy, open **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://vozvdtgsinocrohmasvq.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | copy from Supabase (see below) |

   To get the second value: **Supabase → Settings → API →** copy the
   **`anon` / `public`** key. It is long. It is safe to copy — it is already
   inside the app and protected by your database rules.

   > Do **not** add the `service_role` key. Nothing needs it yet, and it is
   > the dangerous one.

6. Click **Deploy** and wait 1–3 minutes.

---

## Step 4 — If the deploy fails

There is a real chance the first attempt fails, because the sandboxed
development environment cannot run Next.js's compiler to check it in advance.
This is expected and usually quick to fix.

**If it goes red:** open the deploy, click **Building** to expand the log, and
scroll to the first line containing `Error:`. That line names the problem.
Fix it, then re-publish from GitHub Desktop.

**Do not schedule the client demo for the same hour as the first deploy.**

---

## Step 5 — Check it yourself before showing anyone

Vercel gives you an address like `inquiry-tracking-system.vercel.app`.

1. Open it on your laptop. You should land on the sign-in screen with the ANK
   logo.
2. Sign in with your admin account.
3. Check the dashboard shows the follow-up alarms, and open Inquiries, Orders
   and R&D.
4. Open the same address on your phone and install it —
   see `HANDOVER.md` section 2.

**Also test the security, once:** open the address in a private/incognito
window and try going straight to `/dashboard`. It should bounce you to the
sign-in screen. That is the proof that outsiders see nothing.

---

## Step 6 — Future updates

Once this is set up, updates are automatic:

1. I change the code in your folder.
2. You open GitHub Desktop, type a short summary, click **Commit to main**,
   then **Push origin**.
3. Vercel rebuilds within about two minutes. Nobody reinstalls anything, and
   no data is lost.

---

## Optional — a proper web address

The free `.vercel.app` address works fine. If you would rather it lived at
something like `track.ankautomation.in`:

- Vercel → your project → **Settings → Domains** → add the subdomain, then
  add the DNS record it shows you at whoever manages `ankautomation.in`.
- Free on Vercel's side. Takes up to a few hours to start working.

Worth doing before handover if the client will use this daily — it looks like
their system rather than a demo.
