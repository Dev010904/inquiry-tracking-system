'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/constants'
import { FEATURE_LABELS } from '@/components/shell/nav-items'
import { createRole, deleteRole, setRoleFeature } from '@/app/(app)/settings/actions'
import type { RoleFeatureRow, RoleRow } from '@/types/database'

type Props = {
  roles: RoleRow[]
  features: RoleFeatureRow[]
  /** The role the signed-in admin holds, if any. Its grid is read-only. */
  ownRoleId: string | null
  /** How many people hold each role, so a delete can say what it will do. */
  holders: Record<string, number>
}

type Level = 'none' | 'view' | 'edit'

function levelOf(row: RoleFeatureRow | undefined): Level {
  if (!row || !row.can_view) return 'none'
  return row.can_edit ? 'edit' : 'view'
}

/**
 * Create roles and set what each one can reach.
 *
 * The grid is built from `FEATURE_KEYS`, so a feature added to that list
 * appears here without anyone remembering to add it — which is the point of
 * keeping one list rather than two.
 *
 * Settings is deliberately absent from the grid. It is not grantable through
 * a role at all; `can_manage_settings` on the account is the only way in, and
 * the database rejects a role that tries to carry it.
 */
export function RoleManager({ roles, features, ownRoleId, holders }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const byRole = new Map<string, Map<string, RoleFeatureRow>>()
  for (const row of features) {
    if (!byRole.has(row.role_id)) byRole.set(row.role_id, new Map())
    byRole.get(row.role_id)!.set(row.feature_key, row)
  }

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

  function setLevel(roleId: string, feature: FeatureKey, level: Level) {
    run(
      () => setRoleFeature(roleId, feature, level !== 'none', level === 'edit'),
      'Permission saved'
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Roles</CardTitle>
        <p className="text-sm text-muted-foreground">
          What each role can open and change. A person with no role gets everything except
          Settings, exactly as before roles existed — so leaving someone unassigned changes
          nothing for them.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {roles.map((role) => {
          const grants = byRole.get(role.id) ?? new Map()
          const isOwn = role.id === ownRoleId
          const held = holders[role.id] ?? 0

          return (
            <div key={role.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{role.name}</p>
                    {role.is_system && (
                      <Badge variant="secondary">
                        <Lock className="mr-1 h-3 w-3" aria-hidden />
                        Built in
                      </Badge>
                    )}
                    {isOwn && <Badge variant="muted">Your role</Badge>}
                  </div>
                  {role.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{role.description}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {held === 0
                      ? 'Nobody holds this role'
                      : `${held} ${held === 1 ? 'person holds' : 'people hold'} this role`}
                  </p>
                </div>

                {!role.is_system && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      const warning =
                        held === 0
                          ? `Delete the role "${role.name}"?`
                          : `Delete the role "${role.name}"? ${held} ${
                              held === 1 ? 'person' : 'people'
                            } will fall back to their Admin or Staff account setting.`
                      if (window.confirm(warning)) {
                        run(() => deleteRole(role.id), 'Role deleted')
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete
                  </Button>
                )}
              </div>

              {isOwn && (
                <p className="mt-3 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  You hold this role, so you cannot change what it can reach. Another admin can.
                </p>
              )}

              <ul className="mt-3 divide-y border-t">
                {FEATURE_KEYS.map((feature) => {
                  const level = levelOf(grants.get(feature))
                  return (
                    <li
                      key={feature}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="text-sm">{FEATURE_LABELS[feature]}</span>
                      <div
                        role="group"
                        aria-label={`${FEATURE_LABELS[feature]} access for ${role.name}`}
                        className="flex overflow-hidden rounded-md border"
                      >
                        {(['none', 'view', 'edit'] as Level[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={level === option}
                            disabled={pending || isOwn}
                            onClick={() => setLevel(role.id, feature, option)}
                            className={
                              'h-8 px-3 text-xs font-medium capitalize transition-colors disabled:opacity-50 ' +
                              (level === option
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-transparent text-muted-foreground hover:bg-accent')
                            }
                          >
                            {option === 'none' ? 'Hidden' : option === 'view' ? 'View' : 'Edit'}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        <div className="rounded-lg border border-dashed p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
            New role
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="new-role-name">
              <Input
                id="new-role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production"
              />
            </Field>
            <Field label="Description" htmlFor="new-role-description">
              <Input
                id="new-role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shop floor — orders and R&D only"
              />
            </Field>
          </div>
          <Button
            className="mt-3"
            size="sm"
            disabled={pending || name.trim().length < 2}
            onClick={() =>
              run(async () => {
                const result = await createRole(name, description)
                if (result.ok) {
                  setName('')
                  setDescription('')
                }
                return result
              }, 'Role created')
            }
          >
            Create role
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            A new role starts with nothing granted. Set what it can reach above, then assign it to
            someone in Staff accounts.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
