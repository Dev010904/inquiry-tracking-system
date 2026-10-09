/**
 * ZKTeco's ADMS ("cloud server" / push) protocol, as spoken by eSSL, ZKTeco
 * and Realtime attendance devices.
 *
 * The device starts every exchange; the server never calls it:
 *
 *   GET  /iclock/cdata?SN=…&options=all     hello: the server answers with options
 *   POST /iclock/cdata?SN=…&table=ATTLOG    punches, one per line, tab-separated:
 *                                           number, "YYYY-MM-DD HH:MM:SS", state, verify, …
 *   GET  /iclock/getrequest?SN=…            "any commands?" every Delay seconds
 *   POST /iclock/devicecmd?SN=…             results of commands (we send none)
 *
 * Every answer is plain text. We ask for attendance logs only (TransFlag) and
 * never store the user or fingerprint tables a device may still offer: the
 * fingerprints stay on the device.
 */

export type PunchLine = { c: string; t: string; s?: string; v?: string }

const STAMP = /^[0-9]{1,20}$/
const TIME = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/

/** "2026-10-09 9:02" → "2026-10-09 09:02:00"; null when it is not a time. */
export function normaliseTime(value: string): string | null {
  const m = TIME.exec(value.trim())
  if (!m) return null
  const hour = Number(m[2])
  const minute = Number(m[3])
  const second = Number(m[4] ?? 0)
  if (hour > 23 || minute > 59 || second > 59) return null
  return `${m[1]} ${String(hour).padStart(2, '0')}:${m[3]}:${String(second).padStart(2, '0')}`
}

/**
 * Lines of an ATTLOG upload. Tab-separated by the protocol; some firmware pads
 * with spaces instead, so a line without tabs is split on runs of spaces with
 * the date and time joined back together.
 */
export function parseAttlog(body: string): PunchLine[] {
  const out: PunchLine[] = []
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line) continue
    let fields: string[]
    if (line.includes('\t')) {
      fields = line.split('\t').map((f) => f.trim())
    } else {
      const parts = line.split(/\s+/)
      fields = parts.length >= 3 ? [parts[0]!, `${parts[1]} ${parts[2]}`, ...parts.slice(3)] : parts
    }
    const code = fields[0] ?? ''
    const time = normaliseTime(fields[1] ?? '')
    if (!/^[0-9A-Za-z]{1,24}$/.test(code) || !time) continue
    const row: PunchLine = { c: code, t: time }
    if (fields[2] && /^\d{1,3}$/.test(fields[2])) row.s = fields[2]
    if (fields[3] && /^\d{1,3}$/.test(fields[3])) row.v = fields[3]
    out.push(row)
  }
  return out
}

/**
 * The options a device asks for in its hello. The stamp tells it how far its
 * attendance log has been received, so after a restart it sends only what is
 * new; "None" asks for everything it holds (a device seen for the first time).
 * TransFlag asks for attendance logs only, OPERLOGStamp=9999 waives the
 * operation log, and there is no TimeZone line: the device's own clock, set to
 * India time when it is installed, is the one that counts.
 */
export function helloResponse(serial: string, stamp: string | null | undefined): string {
  const attlogStamp = stamp && STAMP.test(stamp) ? stamp : 'None'
  return [
    `GET OPTION FROM: ${serial}`,
    `ATTLOGStamp=${attlogStamp}`,
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=9999',
    'ErrorDelay=60',
    'Delay=30',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog',
    'Realtime=1',
    'Encrypt=None',
    '',
  ].join('\r\n')
}

export function isStamp(value: string | null | undefined): value is string {
  return !!value && STAMP.test(value)
}

/** A serial number as devices print it; anything else is refused before the database. */
export function isSerial(value: string | null | undefined): value is string {
  return !!value && /^[0-9A-Za-z_-]{3,40}$/.test(value)
}
