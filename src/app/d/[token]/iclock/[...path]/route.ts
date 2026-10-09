import { handleDeviceRequest } from '@/lib/attendance/device-endpoint'

/**
 * The same as /iclock/…, for a device that must carry its token: its server
 * address is set to <this website>/d/<token>, and a device marked "token
 * required" is refused anywhere else.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ token: string; path: string[] }> }

function tokenOf(token: string): string | null {
  return /^[0-9a-f]{32}$/.test(token) ? token : null
}

export async function GET(request: Request, { params }: Params) {
  const { token, path } = await params
  return handleDeviceRequest(request, path, tokenOf(token))
}

export async function POST(request: Request, { params }: Params) {
  const { token, path } = await params
  return handleDeviceRequest(request, path, tokenOf(token))
}
