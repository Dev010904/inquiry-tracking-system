'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Pencil, Phone, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { contactSchema } from '@/lib/schemas/company'
import { saveContact } from '@/app/(app)/companies/actions'

export type EditableContact = {
  id: string
  name: string
  designation: string | null
  phone: string | null
  email: string | null
  is_primary: boolean
}

type Props = {
  companyId: string
  contacts: EditableContact[]
  /** View-only roles see the list and no way to change it. */
  canEdit: boolean
}

type Draft = {
  name: string
  designation: string
  phone: string
  email: string
  is_primary: boolean
}

const EMPTY: Draft = { name: '', designation: '', phone: '', email: '', is_primary: false }

/**
 * The contacts list, with add and edit.
 *
 * Contacts were in the same position as companies: typed once on the inquiry
 * form and then unreachable. A phone number that cannot be corrected is worse
 * than no phone number, because someone trusts it.
 */
export function ContactEditor({ companyId, contacts, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function begin(contact: EditableContact | null) {
    setEditing(contact?.id ?? null)
    setDraft(
      contact
        ? {
            name: contact.name,
            designation: contact.designation ?? '',
            phone: contact.phone ?? '',
            email: contact.email ?? '',
            is_primary: contact.is_primary,
          }
        : { ...EMPTY, is_primary: contacts.length === 0 }
    )
    setErrors({})
    setOpen(true)
  }

  function submit() {
    const parsed = contactSchema.safeParse(draft)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})

    startTransition(async () => {
      const result = await saveContact(companyId, editing, draft)
      if (result.ok) {
        toast.success(editing ? 'Contact updated' : 'Contact added')
        setOpen(false)
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  const set = (key: keyof Draft) => (value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No contacts recorded.</p>
      ) : (
        <ul className="divide-y">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">{contact.name}</p>
                  {contact.is_primary && (
                    <Star className="h-3.5 w-3.5 text-duesoon" aria-label="Primary contact" />
                  )}
                </div>
                {contact.designation && (
                  <p className="text-sm text-muted-foreground">{contact.designation}</p>
                )}
                <div className="flex flex-col gap-0.5 text-sm">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 break-all hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {contact.email}
                    </a>
                  )}
                </div>
              </div>

              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => begin(contact)}
                  aria-label={`Edit ${contact.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => begin(null)} className="w-full">
          <Plus className="h-4 w-4" aria-hidden />
          Add a contact
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit contact' : 'Add a contact'}
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="contact-name" required error={errors.name}>
            <Input
              id="contact-name"
              value={draft.name}
              onChange={(e) => set('name')(e.target.value)}
            />
          </Field>

          <Field label="Designation" htmlFor="contact-designation" error={errors.designation}>
            <Input
              id="contact-designation"
              value={draft.designation}
              placeholder="e.g. Purchase Manager"
              onChange={(e) => set('designation')(e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor="contact-phone" error={errors.phone}>
              <Input
                id="contact-phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => set('phone')(e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="contact-email" error={errors.email}>
              <Input
                id="contact-email"
                type="email"
                value={draft.email}
                onChange={(e) => set('email')(e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
              checked={draft.is_primary}
              onChange={(e) => set('is_primary')(e.target.checked)}
            />
            <span>
              <span className="font-medium">Primary contact</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The one printed on their documents. Setting this moves it off whoever holds it now.
              </span>
            </span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {editing ? 'Save contact' : 'Add contact'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
