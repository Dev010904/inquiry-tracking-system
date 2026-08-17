'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updateOwnProfile } from '@/app/(app)/profile/actions'

export function ProfileForm({
  fullName,
  phone,
  email,
}: {
  fullName: string
  phone: string | null
  email: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(fullName)
  const [tel, setTel] = useState(phone ?? '')

  function submit() {
    startTransition(async () => {
      const result = await updateOwnProfile({ full_name: name, phone: tel })
      if (result.ok) {
        toast.success('Details saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" htmlFor="full_name" required>
          <Input id="full_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Email"
        htmlFor="email"
        hint="Changing your sign-in email is done by an administrator in Supabase"
      >
        <Input id="email" value={email ?? ''} disabled readOnly />
      </Field>

      <Button onClick={submit} disabled={pending || name.trim().length < 2}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save details
      </Button>
    </div>
  )
}
