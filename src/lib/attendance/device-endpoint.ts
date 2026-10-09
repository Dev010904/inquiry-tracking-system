import 'server-only'

import { createDeviceClient } from '@/lib/supabase/device'
import { helloResponse, isSerial, parseAttlog, type PunchLine } from '@/lib/attendance/adms'

/**
 * Answers an attendance device. Served at /iclock/* and, for a device that must
 * carry a token, at /d/<token>/iclock/*.
 *
 * No session and no cookies: the middleware does not run on these paths. Who
 * may send is decided in the database — a device is refused until an admin
 * approves it on the Attendance setup screen — so this file only translates
 * between the device's plain-text protocol and the two database functions.
 *
 * A refused upload is answered with an error on purpose. The device then keeps
 * the punches and sends them again later, so nothing punched before the
 * device was approved is lost.
 */

const MAX_BODY_BYTES = 1_000_000
const CHUNK = 2000

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return null
  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > MAX_BODY_BYTES) return null
  return new TextDecoder('utf-8').decode(buffer)
}

function clientIp(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
}

/** What the device says about itself in its hello, kept for the setup screen. */
function deviceInfo(url: URL): string | null {
  const keep = ['pushver', 'DeviceType', 'language', 'pushcommkey']
  const parts = keep
    .map((key) => [key, url.searchParams.get(key)] as const)
    .filter(([key, value]) => value && key !== 'pushcommkey')
    .map(([key, value]) => `${key}=${value}`)
  return parts.length ? parts.join(' ').slice(0, 300) : null
}

export async function handleDeviceRequest(request: Request, path: string[], token: string | null): Promise<Response> {
  const url = new URL(request.url)
  // Some firmware asks for /iclock/cdata.aspx.
  const endpoint = path.join('/').toLowerCase().replace(/\.aspx$/, '')
  const serial = url.searchParams.get('SN') ?? url.searchParams.get('sn')

  if (endpoint === 'ping') return text('OK')
  if (!isSerial(serial)) return text('ERROR', 400)

  const supabase = createDeviceClient()
  const ip = clientIp(request)

  async function hello(info: string | null) {
    const { data, error } = await supabase.rpc('attendance_device_hello', {
      p_serial: serial!,
      p_token: token,
      p_ip: ip,
      p_info: info,
    })
    return error ? null : data
  }

  if (endpoint === 'cdata' && request.method === 'GET') {
    const result = await hello(deviceInfo(url))
    if (!result) return text('ERROR', 503)
    if (result.status === 'rejected' || result.status === 'blocked') return text('ERROR', 403)
    // A pending device gets its options too, so it keeps calling while it waits.
    return text(helloResponse(serial!, result.stamp))
  }

  if (endpoint === 'cdata' && request.method === 'POST') {
    const body = await readBody(request)
    if (body === null) return text('ERROR', 413)
    // Only attendance logs are kept. A device that offers its user or
    // fingerprint tables is thanked and ignored.
    if ((url.searchParams.get('table') ?? '').toUpperCase() !== 'ATTLOG') return text('OK')

    const rows: PunchLine[] = parseAttlog(body)
    const stamp = url.searchParams.get('Stamp') ?? url.searchParams.get('stamp')
    let received = 0
    for (let i = 0; i < Math.max(rows.length, 1); i += CHUNK) {
      const { data, error } = await supabase.rpc('attendance_device_push', {
        p_serial: serial!,
        p_token: token,
        p_ip: ip,
        // The stamp only once the last part has gone in, so a failure part-way
        // makes the device send the whole batch again (duplicates are ignored).
        p_stamp: i + CHUNK >= rows.length ? stamp : null,
        p_rows: rows.slice(i, i + CHUNK),
      })
      if (error) return text('ERROR', 503)
      if (data === -1) return text('ERROR', 403)
      received += data ?? 0
    }
    return text(`OK: ${received}`)
  }

  if (endpoint === 'getrequest') {
    // The device's heartbeat. It keeps "last seen" fresh on the setup screen;
    // no commands are ever sent to a device.
    const result = await hello(null)
    if (result && (result.status === 'rejected' || result.status === 'blocked')) return text('ERROR', 403)
    return text('OK')
  }

  if (endpoint === 'devicecmd') return text('OK')

  return text('Not found', 404)
}
