import { Badge, type BadgeProps } from '@/components/ui/badge'
import { CONFIDENTIALITY, IP_STATUS, IP_TYPE } from '@/lib/constants'
import type { Confidentiality, IpStatus, IpType } from '@/types/database'

const STATUS_VARIANT: Record<IpStatus, BadgeProps['variant']> = {
  idea: 'muted',
  disclosure_filed: 'secondary',
  drafting: 'secondary',
  filed: 'default',
  published: 'default',
  under_examination: 'duesoon',
  granted: 'ok',
  refused: 'overdue',
  abandoned: 'muted',
  lapsed: 'overdue',
}

export function IpStatusBadge({ status }: { status: IpStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{IP_STATUS[status]}</Badge>
}

export function IpTypeBadge({ type }: { type: IpType }) {
  return <Badge variant="secondary">{IP_TYPE[type]}</Badge>
}

/** Only 'restricted' is worth calling out — the rest is the normal case. */
export function ConfidentialityBadge({ level }: { level: Confidentiality }) {
  if (level !== 'restricted') return null
  return <Badge variant="overdue">{CONFIDENTIALITY[level]}</Badge>
}

/**
 * Renewal countdown. Steps through the same 90/30/7 day thresholds the
 * dashboard alarm panel uses, so the two never disagree.
 */
export function RenewalBadge({
  days,
  overdue,
  dead,
}: {
  days: number | null
  overdue: boolean
  dead: boolean
}) {
  if (dead) return <Badge variant="muted">No renewal</Badge>
  if (days === null) return <Badge variant="muted">Not set</Badge>
  if (overdue) return <Badge variant="overdue">{Math.abs(days)}d overdue</Badge>
  if (days === 0) return <Badge variant="overdue">Due today</Badge>
  if (days <= 7) return <Badge variant="overdue">{days}d left</Badge>
  if (days <= 30) return <Badge variant="duesoon">{days}d left</Badge>
  if (days <= 90) return <Badge variant="duesoon">{days}d</Badge>
  return <Badge variant="muted">{days}d</Badge>
}
