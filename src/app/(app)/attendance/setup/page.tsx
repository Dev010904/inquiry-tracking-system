import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SetupDevices } from '@/components/attendance/setup-devices'
import { SetupPeople } from '@/components/attendance/setup-people'
import { SetupHolidays, SetupLeaveTypes, SetupShifts } from '@/components/attendance/setup-rules'
import { istToday } from '@/lib/attendance/time'
import { requireProfile } from '@/lib/auth'
import { getSetup, lastSeenLabel } from '@/lib/queries/attendance'

export const metadata: Metadata = { title: 'Attendance setup · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

/**
 * An admin's setup: people and their device numbers, office timings,
 * holidays, leave types, the devices and the pen-drive import.
 *
 * A plain 404 for anyone else, like Settings: the database would refuse every
 * change anyway, and a non-admin has no reason to learn the screen exists.
 */
export default async function AttendanceSetupPage() {
  const profile = await requireProfile()
  if (profile.role !== 'admin') notFound()

  const today = istToday()
  const [setup, h] = await Promise.all([getSetup(), headers()])
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'ank-its.vercel.app'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Attendance setup</h1>
        <p className="text-sm text-muted-foreground">
          Only admins see this screen. Every change here is kept in Recent changes under Attendance.
        </p>
      </div>
      <SetupPeople people={setup.people} candidates={setup.candidates} shifts={setup.shifts} unmatched={setup.unmatched} today={today} />
      <SetupDevices devices={setup.devices.map((d) => ({ ...d, seen: lastSeenLabel(d.last_seen_at) }))} host={host} />
      <SetupShifts shifts={setup.shifts} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SetupHolidays holidays={setup.holidays} today={today} />
        <SetupLeaveTypes leaveTypes={setup.leaveTypes} />
      </div>
    </div>
  )
}
