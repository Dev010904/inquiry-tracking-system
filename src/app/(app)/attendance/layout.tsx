import { AttendanceTabs } from '@/components/attendance/attendance-tabs'
import { requireFeature } from '@/lib/permissions'
import { pendingRequestCount } from '@/lib/queries/attendance'

/**
 * Gate and tabs for every screen under /attendance.
 *
 * Seeing Attendance is the role's call (`attendance`); managing it is an
 * admin's, checked again in every action and in the database.
 */
export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireFeature('attendance')
  const isAdmin = profile.role === 'admin'
  const pending = isAdmin ? await pendingRequestCount() : 0

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <AttendanceTabs isAdmin={isAdmin} pending={pending} />
      {children}
    </div>
  )
}
