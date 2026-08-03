'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const signInSchema = z.object({
  email: z.string().min(1, 'Enter your email address').email('That does not look like an email address'),
  password: z.string().min(1, 'Enter your password'),
})

export type SignInState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
}

/**
 * Only internal paths are accepted as a post-login destination, so a crafted
 * `?next=https://evil.example` link cannot turn our login page into an open
 * redirect. Protocol-relative `//host` is rejected too.
 */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === 'string' ? next : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors
    return { fieldErrors: { email: flat.email?.[0], password: flat.password?.[0] } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  })

  if (error || !data.user) {
    // Deliberately vague: never reveal whether the email exists.
    return { error: 'Incorrect email or password.' }
  }

  // A valid password is not enough — the account must still be active staff.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut()
    return { error: 'This account is not active. Ask an administrator to enable it.' }
  }

  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('next')))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
