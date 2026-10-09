import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Fingerprint,
  FlaskConical,
  History,
  LayoutDashboard,
  ListChecks,
  BarChart3,
  Package,
  Settings,
  Wallet,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/constants'

export type NavItem = {
  href: string
  label: string
  /** Short label for the mobile tab bar, where width is tight. */
  short: string
  icon: LucideIcon
  /**
   * The permission this destination sits behind, or undefined for a
   * destination governed some other way. Settings is the only one: it is held
   * by named people through `can_manage_settings`, not granted by a role.
   */
  feature?: FeatureKey
  /**
   * Hidden unless the profile carries `can_manage_settings`. Being an admin is
   * not enough — Settings is held by named people, not by a role.
   */
  settingsManagerOnly?: boolean
  /** Appears in the mobile bottom bar. Keep this to five items. */
  primary?: boolean
  /**
   * Route not built yet — filtered out of every menu. A link that 404s in
   * front of a client is worse than a feature that is visibly absent.
   * Nothing carries this flag now; it stays for the next unfinished screen.
   */
  unbuilt?: boolean
}

/**
 * One entry per feature key, keyed by it.
 *
 * Typed as a full `Record<FeatureKey, …>` on purpose: adding a key to
 * `FEATURE_KEYS` without giving it a destination here is a compile error, so
 * a new feature cannot slip into the database's grantable list while being
 * invisible in the menu and in the permission editor.
 */
const FEATURE_NAV: Record<FeatureKey, Omit<NavItem, 'feature'>> = {
  dashboard: { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, primary: true },
  inquiries: { href: '/inquiries', label: 'Inquiries', short: 'Inquiries', icon: ClipboardList, primary: true },
  orders: { href: '/orders', label: 'Orders', short: 'Orders', icon: Package, primary: true },
  rnd: { href: '/rnd', label: 'R&D Projects', short: 'R&D', icon: FlaskConical, primary: true },
  ip: { href: '/ip', label: 'IP Portfolio', short: 'IP', icon: ShieldCheck, primary: true },
  // "Documents" rather than "Invoices": the section holds quotations,
  // proformas, challans and notes as well, and an invoice is only one of them.
  // Somebody looking for a quotation had no reason to open a menu called
  // Invoices.
  documents: { href: '/documents', label: 'Documents', short: 'Docs', icon: FileText },
  meetings: { href: '/meetings', label: 'Meetings', short: 'Meetings', icon: CalendarDays },
  companies: { href: '/companies', label: 'Companies', short: 'Clients', icon: Building2 },
  activity: { href: '/activity', label: 'Recent changes', short: 'Changes', icon: History },
  reports: { href: '/reports', label: 'Reports', short: 'Reports', icon: BarChart3 },
  // Money received and money owed. It used to live only inside a single
  // order, so "what came in this year" and "who owes us" had no answer
  // anywhere in the app — findable only by someone already told where it was.
  payments: { href: '/payments', label: 'Ledger', short: 'Ledger', icon: Wallet },
  attendance: { href: '/attendance', label: 'Attendance', short: 'Attendance', icon: Fingerprint },
}

const ALL_NAV_ITEMS: NavItem[] = [
  ...FEATURE_KEYS.map((feature) => ({ feature, ...FEATURE_NAV[feature] })),
  {
    href: '/settings',
    label: 'Settings',
    short: 'Settings',
    icon: Settings,
    settingsManagerOnly: true,
  },
]

/** What the menus render. Add `unbuilt: true` to hide a route in progress. */
export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((item) => !item.unbuilt)

/**
 * The way home for someone whose role withholds the Dashboard.
 *
 * /dashboard renders their My work page instead of the commercial dashboard,
 * but with the Dashboard item hidden nothing in the menus pointed there — once
 * they opened a record, only the browser's Back button or signing in again
 * took them back to their own work. Shown only when the Dashboard item is not.
 */
export const MY_WORK_ITEM: NavItem = {
  href: '/dashboard',
  label: 'My work',
  short: 'My work',
  icon: ListChecks,
  primary: true,
}

/** The menu items a permission set can reach, My work first when it applies. */
export function menuItems(visibleFeatures: FeatureKey[], canManageSettings: boolean): NavItem[] {
  const items = NAV_ITEMS.filter((item) =>
    item.feature
      ? visibleFeatures.includes(item.feature)
      : !item.settingsManagerOnly || canManageSettings
  )
  return visibleFeatures.includes('dashboard') ? items : [MY_WORK_ITEM, ...items]
}

/**
 * The label the permission editor shows for each feature, taken from the menu
 * rather than kept in a second list that could drift from it.
 */
export const FEATURE_LABELS: Record<FeatureKey, string> = Object.fromEntries(
  FEATURE_KEYS.map((feature) => [feature, FEATURE_NAV[feature].label])
) as Record<FeatureKey, string>

/** Highlights /inquiries for /inquiries/new and /inquiries/[id] too. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
