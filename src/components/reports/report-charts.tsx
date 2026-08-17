'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '@/lib/format'
import type { AgingBucket, MonthlyPoint } from '@/lib/queries/reports'

/** Compact axis labels — ₹12,50,000 does not fit on a phone. */
function compactINR(value: number): string {
  if (Math.abs(value) >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(value) >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`
  if (Math.abs(value) >= 1_000) return `₹${Math.round(value / 1_000)}k`
  return `₹${value}`
}

const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}:{' '}
          {entry.name === 'Order value'
            ? formatMoney(Number(entry.value), 'INR')
            : entry.name === 'Conversion'
              ? `${entry.value}%`
              : entry.value}
        </p>
      ))}
    </div>
  )
}

/**
 * Inquiries vs orders per month, with the conversion rate overlaid.
 * Bars share a left axis (counts); the line uses the right axis (percent),
 * because mixing counts and percentages on one scale is meaningless.
 */
export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis yAxisId="count" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          yAxisId="pct"
          orientation="right"
          domain={[0, 100]}
          unit="%"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
        <Bar
          yAxisId="count"
          dataKey="inquiries"
          name="Inquiries"
          fill="hsl(var(--muted-foreground))"
          opacity={0.35}
          radius={[3, 3, 0, 0]}
        />
        <Bar
          yAxisId="count"
          dataKey="orders"
          name="Orders"
          fill="hsl(var(--primary))"
          radius={[3, 3, 0, 0]}
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="conversionPct"
          name="Conversion"
          stroke="hsl(var(--duesoon))"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function OrderValueChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compactINR} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
        <Bar
          dataKey="orderValue"
          name="Order value"
          fill="hsl(var(--primary))"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Aging buckets get progressively redder — 90+ days is the one that hurts. */
const AGING_COLORS = ['hsl(var(--ok))', 'hsl(var(--duesoon))', 'hsl(var(--duesoon))', 'hsl(var(--overdue))']

export function AgingChart({ data }: { data: AgingBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compactINR} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const bucket = payload[0]!.payload as AgingBucket
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 font-medium">{label}</p>
                <p>{formatMoney(bucket.amount, 'INR')}</p>
                <p className="text-muted-foreground">
                  {bucket.count} order{bucket.count === 1 ? '' : 's'}
                </p>
              </div>
            )
          }}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
        />
        <Bar dataKey="amount" name="Outstanding" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={AGING_COLORS[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
