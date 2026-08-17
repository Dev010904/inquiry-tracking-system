import { DollarSign, Euro, IndianRupee, JapaneseYen, type LucideIcon } from 'lucide-react'
import type { CurrencyCode } from '@/types/database'

/**
 * CNY has no lucide glyph of its own and borrows the yen mark, which is what a
 * renminbi symbol looks like anyway. Everything else maps one to one.
 */
const CURRENCY_ICON: Record<CurrencyCode, LucideIcon> = {
  INR: IndianRupee,
  USD: DollarSign,
  EUR: Euro,
  JPY: JapaneseYen,
  CNY: JapaneseYen,
}

export function CurrencyIcon({
  currency,
  className,
}: {
  currency: CurrencyCode
  className?: string
}) {
  const Icon = CURRENCY_ICON[currency] ?? IndianRupee
  return <Icon className={className} aria-hidden />
}
