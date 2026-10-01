'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { setUserActive, setUserRole, setUserRoleId } from '@/app/(app)/settings/actions'
import type { ProfileRow, RoleRow } from '@/types/database'

export function UserTable({
  users,
  currentUserId,
  roles,
  canManageAccounts,
}: {
  users: ProfileRow[]
  currentUserId: string
  roles: RoleRow[]
  /** Only an admin may change another person's account; the database agrees. */
  canManageAccounts: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        toast.success(success)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <ul className="divide-y">
      {users.map((user) => {
        const isSelf = user.id === currentUserId
        const locked = pending || isSelf || !canManageAccounts
        return (
          <li
            key={user.id}
            className={cn(
              'flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between',
              !user.is_active && 'opacity-60'
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{user.full_name}</p>
                {isSelf && <Badge variant="secondary">You</Badge>}
                {!user.is_active && <Badge variant="muted">Inactive</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">{user.email ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                Added {formatDate(user.created_at)}
                {user.phone ? ` · ${user.phone}` : ''}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Two separate things, deliberately. The Admin/Staff setting is
                  the capability the database enforces — who may delete, who
                  may reassign work. The role beside it decides only which
                  screens the person sees. */}
              <Select
                aria-label={`Account type for ${user.full_name}`}
                className="h-9 w-28"
                value={user.role}
                disabled={locked}
                onChange={(e) =>
                  run(
                    () => setUserRole(user.id, e.target.value as 'admin' | 'staff'),
                    'Account type updated'
                  )
                }
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>

              <Select
                aria-label={`Role for ${user.full_name}`}
                className="h-9 w-40"
                value={user.role_id ?? ''}
                disabled={locked}
                onChange={(e) =>
                  run(() => setUserRoleId(user.id, e.target.value || null), 'Role updated')
                }
              >
                <option value="">No role — sees everything</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>

              <Button
                size="sm"
                variant={user.is_active ? 'outline' : 'default'}
                disabled={locked}
                onClick={() =>
                  run(
                    () => setUserActive(user.id, !user.is_active),
                    user.is_active ? 'Account deactivated' : 'Account activated'
                  )
                }
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {user.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
