import {
  Building2,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  BarChart3,
  Package,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  /** Short label for the mobile tab bar, where width is tight. */
  short: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Appears in the mobile bottom bar. Keep this to five items. */
  primary?: boolean
  /**
   * Route not built yet. Kept here so re-enabling is a one-word edit, but
   * filtered out of every menu — a link that 404s in front of a client is
   * worse than a feature that is visibly absent.
   */
  unbuilt?: boolean
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, primary: true },
  { href: '/inquiries', label: 'Inquiries', short: 'Inquiries', icon: ClipboardList, primary: true },
  { href: '/orders', label: 'Orders', short: 'Orders', icon: Package, primary: true },
  { href: '/rnd', label: 'R&D Projects', short: 'R&D', icon: FlaskConical, primary: true },
  { href: '/ip', label: 'IP Portfolio', short: 'IP', icon: ShieldCheck, primary: true, unbuilt: true },
  { href: '/companies', label: 'Companies', short: 'Clients', icon: Building2, unbuilt: true },
  { href: '/reports', label: 'Reports', short: 'Reports', icon: BarChart3, unbuilt: true },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: Settings, adminOnly: true, unbuilt: true },
]

/** What the menus actually render. Drop `unbuilt` above as each phase lands. */
export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((item) => !item.unbuilt)

/** Highlights /inquiries for /inquiries/new and /inquiries/[id] too. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
