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
import { setUserActive, setUserRole } from '@/app/(app)/settings/actions'
import type { ProfileRow } from '@/types/database'

export function UserTable({
  users,
  currentUserId,
}: {
  users: ProfileRow[]
  currentUserId: string
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
                {!user.is_active && <Badge variant="muted">Deactivated</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">{user.email ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                Added {formatDate(user.created_at)}
                {user.phone ? ` · ${user.phone}` : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Select
                aria-label={`Role for ${user.full_name}`}
                className="h-9 w-28"
                value={user.role}
                disabled={pending || isSelf}
                onChange={(e) =>
                  run(
                    () => setUserRole(user.id, e.target.value as 'admin' | 'staff'),
                    'Role updated'
                  )
                }
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>

              <Button
                size="sm"
                variant={user.is_active ? 'outline' : 'default'}
                disabled={pending || isSelf}
                onClick={() =>
                  run(
                    () => setUserActive(user.id, !user.is_active),
                    user.is_active ? 'Account deactivated' : 'Account reactivated'
                  )
                }
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {user.is_active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
