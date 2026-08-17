'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ListTodo, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TASK_STATUS } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { createTask, deleteTask, reassignTask, setTaskStatus } from '@/lib/actions/tasks'
import type { PendingTask } from '@/lib/queries/tasks'
import type { ParentKind } from '@/types/database'

type Props = {
  parentType: ParentKind
  parentId: string
  tasks: PendingTask[]
  staff: { id: string; full_name: string }[]
  currentUserId: string
  isAdmin: boolean
}

/**
 * What is still to be done here.
 *
 * The counterpart to the work updates feed above it: that records what was
 * done, this records what has not been. Overdue work sorts first and is marked
 * in the same red the dashboard alarm panel uses — the same lateness applied
 * to different work should not need a second visual vocabulary to read.
 *
 * Who may do what is decided by the database. `guard_task_ownership()` lets
 * the assignee change status and notes and nothing else, and lets an admin do
 * everything; the controls here mirror that so the screen does not offer an
 * action the server would refuse.
 */
export function PendingWorkCard({
  parentType,
  parentId,
  tasks,
  staff,
  currentUserId,
  isAdmin,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', detail: '', due_date: '', assigned_to: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const overdueCount = tasks.filter((t) => (t.daysOverdue ?? -1) > 0).length

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string
  ) {
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

  function submit() {
    startTransition(async () => {
      const result = await createTask({ ...form, parent_type: parentType, parent_id: parentId })
      if (result.ok) {
        toast.success('Work added')
        setForm({ title: '', detail: '', due_date: '', assigned_to: '' })
        setErrors({})
        setAdding(false)
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className={cn(overdueCount > 0 && 'ring-1 ring-overdue/30')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo
              className={cn('h-5 w-5', overdueCount > 0 ? 'text-overdue' : 'text-muted-foreground')}
              aria-hidden
            />
            Pending work
            {overdueCount > 0 && <Badge variant="overdue">{overdueCount} overdue</Badge>}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            What is still to be done here, and who has it.
          </p>
        </div>

        {isAdmin && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add work
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {tasks.length === 0 && !adding && (
          <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Nothing outstanding.
          </p>
        )}

        {tasks.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-md border">
            {tasks.map((task) => {
              const late = (task.daysOverdue ?? -1) > 0
              const dueToday = task.daysOverdue === 0
              const mine = task.assigned_to === currentUserId
              // Matches guard_task_ownership(): the assignee moves their own
              // work along, an admin moves anyone's.
              const canMove = isAdmin || mine

              return (
                <li
                  key={task.id}
                  className={cn(
                    'flex flex-col gap-3 border-l-4 bg-card p-3 sm:flex-row sm:items-start sm:justify-between',
                    late ? 'border-l-overdue' : dueToday ? 'border-l-duesoon' : 'border-l-border',
                    pending && 'opacity-60'
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{task.title}</span>
                      {task.status !== 'open' && (
                        <Badge variant={task.status === 'blocked' ? 'overdue' : 'secondary'}>
                          {TASK_STATUS[task.status]}
                        </Badge>
                      )}
                    </div>

                    {task.detail && <p className="text-sm text-muted-foreground">{task.detail}</p>}

                    <p className="text-xs text-muted-foreground">
                      {task.assigneeName}
                      {mine && ' (you)'}
                      {task.due_date && (
                        <>
                          {' · '}
                          <span className={cn(late && 'font-medium text-overdue')}>
                            {late
                              ? `${task.daysOverdue} ${task.daysOverdue === 1 ? 'day' : 'days'} overdue`
                              : dueToday
                                ? 'Due today'
                                : `Due ${formatDate(task.due_date)}`}
                          </span>
                        </>
                      )}
                      {!task.due_date && ' · No date set'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Select
                      aria-label={`Status of ${task.title}`}
                      className="h-9 w-36"
                      value={task.status}
                      disabled={pending || !canMove}
                      onChange={(e) =>
                        run(
                          () => setTaskStatus(task.id, e.target.value, parentType, parentId),
                          'Work updated'
                        )
                      }
                    >
                      {Object.entries(TASK_STATUS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>

                    {isAdmin && (
                      <>
                        <Select
                          aria-label={`Assignee for ${task.title}`}
                          className="h-9 w-36"
                          value={task.assigned_to}
                          disabled={pending}
                          onChange={(e) =>
                            run(
                              () => reassignTask(task.id, e.target.value, parentType, parentId),
                              'Work reassigned'
                            )
                          }
                        >
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}
                            </option>
                          ))}
                        </Select>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          aria-label={`Remove ${task.title}`}
                          onClick={() => {
                            if (window.confirm(`Remove "${task.title}"?`)) {
                              run(() => deleteTask(task.id, parentType, parentId), 'Work removed')
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {adding && (
          <div className="space-y-3 rounded-md border border-dashed p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What needs doing" htmlFor="task-title" error={errors.title} required>
                <Input
                  id="task-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Machine the second impeller"
                />
              </Field>
              <Field label="Who for" htmlFor="task-assignee" error={errors.assigned_to} required>
                <Select
                  id="task-assignee"
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                >
                  <option value="">Pick someone</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Due date" htmlFor="task-due" error={errors.due_date}>
              <Input
                id="task-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>

            <Field label="Notes" htmlFor="task-detail" error={errors.detail}>
              <Textarea
                id="task-detail"
                rows={2}
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
                placeholder="Anything the person needs to know"
              />
            </Field>

            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={submit}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Add work
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setAdding(false)
                  setErrors({})
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
