import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { currentAccess } from '@/lib/permissions'

/**
 * The partner's signature, for the printed document — and only for someone
 * signed in who may open documents.
 *
 * It used to sit in /public, where anyone on the internet could download it
 * without signing in: a real handwritten signature, ready to paste onto a
 * forged letterhead. It now lives in src/assets, outside anything Next.js
 * serves by itself, and this route hands it out after the same checks the
 * Documents screens make. A signed-out visitor is sent to the login page like
 * on any other screen; a signed-in account without Documents gets a plain
 * 404, so nothing advertises that the file exists.
 *
 * The URL has no file extension on purpose: the middleware skips paths ending
 * in .png, and this one must pass through it like any page.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SIGNATURE = path.join(process.cwd(), 'src', 'assets', 'signature.png')

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  // Redirects to /login when signed out, and signs out a deactivated account.
  const { features } = await currentAccess()
  if (!features.documents.canView) return notFound()

  const image = await readFile(SIGNATURE)

  return new Response(new Uint8Array(image), {
    headers: {
      'Content-Type': 'image/png',
      // Kept out of the shared and the on-disk browser cache: a laptop left
      // signed out should not still have the signature in its cache folder.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="signature.png"',
    },
  })
}
