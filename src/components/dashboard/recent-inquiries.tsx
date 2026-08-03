import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import type { RecentInquiry } from '@/lib/queries/dashboard'

function ContactLine({ inquiry }: { inquiry: RecentInquiry }) {
  if (!inquiry.contactName) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      <p className="font-medium">
        {inquiry.contactName}
        {inquiry.contactDesignation && (
          <span className="font-normal text-muted-foreground"> · {inquiry.contactDesignation}</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {inquiry.contactPhone && (
          <a href={`tel:${inquiry.contactPhone}`} className="hover:underline">
            {inquiry.contactPhone}
          </a>
        )}
        {inquiry.contactPhone && inquiry.contactEmail && ' · '}
        {inquiry.contactEmail && (
          <a href={`mailto:${inquiry.contactEmail}`} className="hover:underline">
            {inquiry.contactEmail}
          </a>
        )}
      </p>
    </div>
  )
}

/** Table on desktop, stacked cards under md — same data either way. */
export function RecentInquiries({ inquiries }: { inquiries: RecentInquiry[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent inquiries</CardTitle>
        <Link href="/inquiries" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>

      <CardContent>
        {inquiries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No inquiries yet</p>
            <Link href="/inquiries/new" className="text-sm font-medium text-primary hover:underline">
              Log the first inquiry
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Company / school</th>
                    <th className="pb-2 pr-3 font-medium">Contact</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 text-right font-medium">Est. value</th>
                    <th className="pb-2 pr-3 font-medium">Next follow-up</th>
                    <th className="pb-2 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {inquiries.map((inquiry) => (
                    <tr key={inquiry.id} className="align-top hover:bg-accent/40">
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <Link href={`/inquiries/${inquiry.id}`} className="hover:underline">
                          {formatDate(inquiry.inquiryDate)}
                        </Link>
                        {inquiry.inquiryNo && (
                          <p className="text-xs text-muted-foreground">{inquiry.inquiryNo}</p>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{inquiry.companyName}</p>
                        {inquiry.companyType && (
                          <p className="text-xs text-muted-foreground">
                            {COMPANY_TYPE[inquiry.companyType]}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <ContactLine inquiry={inquiry} />
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={inquiry.status} />
                      </td>
                      <td className="tnum py-3 pr-3 text-right whitespace-nowrap">
                        {formatINR(inquiry.estimatedValue)}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {inquiry.nextFollowupAt ? (
                          formatDate(inquiry.nextFollowupAt)
                        ) : (
                          <Badge variant="muted">None set</Badge>
                        )}
                      </td>
                      <td className="py-3 whitespace-nowrap text-muted-foreground">
                        {inquiry.ownerName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y md:hidden">
              {inquiries.map((inquiry) => (
                <li key={inquiry.id} className="py-3 first:pt-0">
                  <Link href={`/inquiries/${inquiry.id}`} className="block space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{inquiry.companyName}</p>
                      <StatusBadge status={inquiry.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inquiry.inquiryNo ? `${inquiry.inquiryNo} · ` : ''}
                      {formatDate(inquiry.inquiryDate)}
                    </p>
                    <ContactLine inquiry={inquiry} />
                    <div className="flex items-center justify-between gap-2 pt-1 text-sm">
                      <span className="tnum font-medium">{formatINR(inquiry.estimatedValue)}</span>
                      <span className="text-xs text-muted-foreground">
                        {inquiry.nextFollowupAt
                          ? `Next: ${formatDate(inquiry.nextFollowupAt)}`
                          : 'No follow-up set'}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
