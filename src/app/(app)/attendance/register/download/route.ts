import { buildRegisterWorkbook } from '@/lib/attendance/excel'
import { formatDateTimeIST } from '@/lib/format'
import { currentAccess } from '@/lib/permissions'
import { companyName, getMonth, getMonthLeaves } from '@/lib/queries/attendance'
import { isIsoMonth, istToday } from '@/lib/attendance/time'

/**
 * The register for one month as an Excel file. An admin gets everyone; anyone
 * else gets their own rows — the same rows the database lets them read.
 *
 * A route handler sits outside the section's layout, so it checks access itself.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { features } = await currentAccess()
  if (!features.attendance.canView) return new Response('Not found', { status: 404 })

  const asked = new URL(request.url).searchParams.get('month')
  const current = istToday().slice(0, 7)
  const month = isIsoMonth(asked) && asked <= current ? asked : current

  const [data, leaves, company] = await Promise.all([getMonth(month), getMonthLeaves(month), companyName()])
  const buffer = await buildRegisterWorkbook({
    company,
    month,
    days: data.range.days,
    results: data.results,
    holidays: new Map(data.holidays.map((h) => [h.holiday_on, h.name])),
    leaves,
    generatedAt: formatDateTimeIST(new Date()).replace(/ IST$/, ''),
  })

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Attendance-${month}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
