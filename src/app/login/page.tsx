import type { Metadata } from 'next'
import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in · Inquiry Tracking System' }

const ERRORS: Record<string, string> = {
  inactive: 'Your account is no longer active. Ask an administrator to enable it.',
  session: 'Your session expired. Please sign in again.',
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = firstParam(params.next) ?? '/dashboard'
  const errorKey = firstParam(params.error)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="ANK Design &amp; Automation Solutions"
            width={800}
            height={528}
            priority
            className="h-auto w-48"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Inquiry Tracking System</h1>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <LoginForm next={next} initialError={errorKey ? ERRORS[errorKey] : undefined} />
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Internal system. Accounts are created by an administrator.
        </p>
      </div>
    </main>
  )
}
