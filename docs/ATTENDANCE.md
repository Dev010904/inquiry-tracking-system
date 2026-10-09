# Attendance — how it works, the fingerprint device, and the test data

Attendance is a new section of the same system (menu → **Attendance**), added
in October 2026. The people on attendance are the same staff logins as
everywhere else: an admin picks a login and gives it the number that person is
enrolled under on the fingerprint device. There is no second list of users.

Released to the team for testing on **9 October 2026**, so everyone can try it
on their own computer and phone and say what should change. It is not counted
as a new version yet (still 1.91); the number moves when the owner signs it
off after that feedback.

## In one paragraph

People punch on a fingerprint device; the device sends each punch (a number
and a time — never the fingerprint) to the system, or the punches are brought
in from a pen drive. The system works out every day for every person from the
office timings, holidays and approved leave: present, half day, absent, late,
left early, overtime, missed punch. Staff see only their own days, apply for
leave and report a forgotten punch; admins see everyone, approve or reject,
fix a day, and download the month as an Excel register. Every change is kept
in Recent changes under **Attendance**.

## The screens

| Tab | Who | What it shows |
|---|---|---|
| **Today** | everyone | Your own day (in/out, hours, late), the month so far and your leave balance. Admins also see the whole office: who is in, late, on leave, not yet in, and whether the device is talking to the system. |
| **Register** | everyone (staff see only themselves) | The month as a grid, one row per person, one coloured mark per day, totals at the end. **Download Excel** gives the same month as a file. Click a name for that person's month. |
| **Person's month** | admin, or the person | Every day with its punches, hours, late and early. Admins can add a missing punch, mark a day (on duty, half day, leave…) or remove a punch they added. |
| **Requests** | everyone | Leave applications and "forgot to punch" requests. Staff apply and can withdraw while waiting; admins approve or reject with an optional note. An approved punch correction adds the punches; approved leave fills those days. |
| **Setup** | admins only | People and their device numbers, the device(s), office timings, holidays, leave types, and the pen-drive import. |

The Attendance permission is in Settings → Roles like every other section.
Administrator and Staff have it from the start; a custom role gets it only if
an admin ticks it.

## How a day is counted

Checked in this order — the first that applies wins:

1. Before the person's **Count attendance from** date: blank.
2. An admin's **mark for the day** (on duty, half day, absent, leave, holiday…).
3. A **holiday** from Setup → Holidays.
4. A **weekly off** from the person's shift (Sunday by default).
5. **Approved leave** — a full or half day; *On duty* counts as present.
6. Otherwise the **punches**: the first is *in*, the last is *out*.
   - No punches → **Absent** (today, before the shift ends: *Not yet in*).
   - One punch only → **Missed punch** (today: *In*).
   - Worked at least the full-day hours (7 h by default) → **Present**;
     at least the half-day hours (4 h) → **Half day**; less → Absent.

**Late** is the first punch after shift start plus the grace time (09:30 + 15
min by default). **Left early** is the last punch before shift end.
**Overtime** is time beyond the shift length once it passes the threshold
(30 min); work on a holiday or weekly off is all overtime. A shift can also
turn every N late marks into half a day off (off by default). All of this is
set per shift in Setup → Office timings (shifts).

All times are Indian time (IST), whatever the computer's clock says.

## The Excel register

Register → **Download Excel** → `Attendance-YYYY-MM.xlsx`, four sheets:

- **Register** — the month grid with coloured marks (P, HD, A, L, OD, H, WO,
  MP…), a key, totals (present, half days, absent, leave, late marks, hours,
  overtime…) and the month's holidays. Header rows and names stay fixed while
  scrolling; prints landscape.
- **Daily details** — one row per person per day: date, day, employee number,
  name, shift, status, in, out, hours, late by, left early by, overtime, every
  punch, note.
- **Punches** — every punch with its source (device, pen drive, added by an
  admin, approved correction).
- **Leave** — every leave in the month with type, days, status and who
  decided.

## The fingerprint device

**Yes, a fingerprint device works with this system.** The fingerprints stay
inside the device; it only sends the person's number and the time. That also
keeps the company clear of storing biometric data under the DPDP Act.

### Which one to buy (prices seen online, October 2026)

| Option | Example | About | How punches arrive |
|---|---|---|---|
| **Cheapest** | ZKTeco **LX50** | ₹3,200 | Copy to a pen drive and import (Setup → Import from a pen drive). Needs someone to do it, e.g. once a week. |
| **Live, recommended** | eSSL **K90 Pro** or any eSSL / ZKTeco model with **"ADMS with HTTPS"** | ₹6,200 | The device sends each punch the moment it happens, over the office Wi-Fi or LAN. Nothing to do by hand. |

**Before buying a live model, ask the dealer: "Does it support ADMS / Cloud
Server with HTTPS (SSL)?"** The system only accepts secure (https)
connections, so a device that can only send plain http will not connect.
Avoid USB fingerprint readers that plug into a PC — they need software on that
PC and do not work with a web system.

Videos (the menus are the same on most eSSL / ZKTeco models):

- eSSL cloud server setup — https://www.youtube.com/watch?v=BmxbB0-kHEs
- eSSL server / domain address setup — https://www.youtube.com/watch?v=yuwQ49jigMg
- ZKTeco / eSSL ADMS guide — https://www.youtube.com/watch?v=3LU43uTUN4I
- LX50: downloading attendance to a pen drive — https://www.youtube.com/watch?v=PEZtaqaIas0
- LX50 review — https://www.youtube.com/watch?v=OFLEU0K04Do

### Setting up a live device

1. Enrol each person on the device (Menu → User Mgt → New User). Note the
   **User ID** the device gives them.
2. In the system: Attendance → Setup → **People on attendance** → **Add
   person** → pick their login, type that User ID as the device number.
3. On the device: Menu → Comm. → **Cloud Server Setting** (on some models
   **ADMS**):
   - Server address: `ank-its.vercel.app` (Setup shows the exact address)
   - Server port: `443`
   - HTTPS / SSL: **On**, and Enable domain name **On** if it asks
4. Within a minute the device appears in Setup → **Fingerprint devices** as *Waiting for approval*.
   Check the serial number matches the sticker on the device and press
   **Approve**. Until then nothing it sends is stored.
5. Punch once and look at Today: the punch shows within a few seconds.

Optional extra safety: **Require token** on the device's row, then give the
device the longer address shown there (`ank-its.vercel.app/d/<token>`).
Not every model accepts an address with a path; if yours does not, leave the
token off — the approval step already stops unknown devices.

If a punch arrives from a number nobody has, it is kept and listed in Setup
under **Punches from numbers nobody has yet**; **Give this number to…** moves
those punches to the right person.

### The pen-drive import

On the device: Menu → USB Manager (or Pen Drive Mng.) → **Download
Attendance Data**. In the system: Setup → **Import from a pen drive** → choose
the file. It reads the device's own file (`…attlog.dat` / `.txt`) or a CSV
with columns for the employee number and the date and time (an Excel report
becomes one by *Save as → CSV*). It shows how many punches and which numbers
it found before anything is saved. Importing the same file twice adds nothing
twice.

## What was checked before release

- The database part (migration 9_01) on the live database inside a
  transaction that was rolled back, then applied. Checked: staff see only
  their own rows; nobody can approve their own leave; leave cannot overlap;
  a repeated punch is stored once; device numbers like `0042` and `42` are the
  same person; punches from an unknown number move to a person when they get
  the number; every change is in Recent changes.
- The device connection with simulated device messages, exactly as an
  eSSL / ZKTeco device sends them: an unapproved device is refused; once
  approved its punches are stored, a resend stores nothing twice, other data
  it sends is ignored. **Not yet tried with a real device** — do that once one
  is bought.
- Every screen signed in as an admin on a local copy running on the live
  data: Today, Register, Excel download (all four sheets), applying for and
  approving leave, a punch correction, marking a day on duty, adding and
  removing a punch, adding and removing a holiday, and the pen-drive import.
- No existing record was changed: a checksum of every table before the test
  matches afterwards, apart from the new attendance tables.

## The test data (kept on purpose — delete when the owner says)

So the team can see an example of everything, these records were left in the
live system. All of them are marked **ZZ TEST** or use the numbers 99xx:

- Device **ZZTEST001** (approved) in Setup → Fingerprint devices.
- **Dev** on attendance as device number **9901**, counted from 1 Oct 2026,
  with punches 1–9 Oct: normal days, a late day (3 Oct), a long day with
  overtime (7 Oct), a half day (8 Oct), a punch added by an admin (2 Oct), an
  approved forgotten punch-out (5 Oct), pen-drive punches (6 Oct).
- 6 Oct marked **On duty** — "ZZ TEST site visit at a client (example)".
- Approved casual leave **12–13 Oct** — "ZZ TEST leave".
- Punches from **9902** and **9903**, which nobody has — the example for
  "Punches from numbers nobody has yet".
- 14 entries in Recent changes under Attendance. These stay as history.

To remove it (Supabase → SQL editor; children first):

```sql
begin;
delete from public.attendance_punches       where device_code in ('9901', '9902', '9903');
delete from public.attendance_day_overrides where person_id in (select id from public.attendance_people where device_code = '9901');
delete from public.attendance_corrections   where person_id in (select id from public.attendance_people where device_code = '9901');
delete from public.attendance_leaves        where person_id in (select id from public.attendance_people where device_code = '9901');
delete from public.attendance_people        where device_code = '9901';
delete from public.attendance_devices       where serial_no = 'ZZTEST001';
commit;
```

If Dev should stay on attendance for real, skip the `attendance_people` line
and change the device number in Setup instead.

## Undoing it

- **Code**: revert the commit; Vercel redeploys the previous version. The
  Attendance menu item disappears; nothing else changes.
- **Database**: the end of `supabase/migrations/20261009_9_01_attendance.sql`
  has the rollback. Nothing outside attendance depends on these tables, so it
  can be undone on its own — but it removes all attendance records with it.
