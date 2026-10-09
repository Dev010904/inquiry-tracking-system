import { handleDeviceRequest } from '@/lib/attendance/device-endpoint'

/**
 * Where an attendance device sends punches (ADMS / "cloud server" setting).
 * The device is set to this website's address; it adds /iclock/… itself.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ path: string[] }> }

export async function GET(request: Request, { params }: Params) {
  return handleDeviceRequest(request, (await params).path, null)
}

export async function POST(request: Request, { params }: Params) {
  return handleDeviceRequest(request, (await params).path, null)
}
