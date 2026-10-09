/**
 * Reads the attendance file a USB-only device writes to a pen drive.
 *
 * Two shapes are understood:
 *   - the device's raw log (attlog.dat / .txt): number, then "YYYY-MM-DD HH:MM:SS",
 *     separated by tabs or spaces — the same lines the device sends over ADMS;
 *   - a CSV with a header row: a column for the employee number and either a
 *     date-and-time column or separate date and time columns. An Excel report
 *     becomes one by "Save as → CSV" in Excel.
 *
 * Dates written with slashes or dashes are read day first (31/10/2026), as
 * they are in India. Client-safe; the browser parses, the server only checks.
 */
import { normaliseTime, parseAttlog } from './adms'
import { normCode } from './labels'

export type ParsedFile = {
  rows: { c: string; t: string }[]
  skipped: number
  first: string | null
  last: string | null
  codes: string[]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 31/10/2026, 31-10-2026, 2026-10-31, 31.10.2026 → 2026-10-31 */
function readDate(value: string): string | null {
  const v = value.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(v)
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return valid(year, Number(m[2]), Number(m[1]))
  }
  return null
}

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCMonth() !== mo - 1) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** 9:05, 09:05:30, 9:05 PM, 21:05 → "HH:MM:SS" */
function readTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(value.trim())
  if (!m) return null
  let h = Number(m[1])
  const suffix = m[4]?.toLowerCase().replace(/\./g, '')
  if (suffix === 'pm' && h < 12) h += 12
  if (suffix === 'am' && h === 12) h = 0
  if (h > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return null
  return `${pad(h)}:${m[2]}:${pad(Number(m[3] ?? 0))}`
}

function readDateTime(value: string): string | null {
  const v = value.trim().replace(/T/, ' ')
  const iso = normaliseTime(v)
  if (iso) return iso
  const parts = v.split(/\s+/)
  if (parts.length >= 2) {
    const date = readDate(parts[0]!)
    const time = readTime(parts.slice(1).join(' '))
    if (date && time) return `${date} ${time}`
  }
  return null
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function finish(found: { c: string; t: string }[], skipped: number): ParsedFile {
  const rows = found.map((r) => ({ c: normCode(r.c), t: r.t }))
  const sorted = rows.map((r) => r.t).sort()
  return {
    rows,
    skipped,
    first: sorted[0] ?? null,
    last: sorted[sorted.length - 1] ?? null,
    codes: [...new Set(rows.map((r) => r.c))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
  }
}

export function parsePunchFile(content: string): ParsedFile {
  const text = content.replace(/^﻿/, '')
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim())

  // Read it both ways and keep whichever finds more punches: the device's own
  // log (a number and a time on every line), or a CSV with a header row.
  const attlog = parseAttlog(text)
  const csv = parseCsv(lines)
  if (attlog.length > 0 && attlog.length >= csv.rows.length) {
    return finish(attlog.map((r) => ({ c: r.c, t: r.t })), lines.length - attlog.length)
  }
  return finish(csv.rows, csv.skipped)
}

function parseCsv(lines: string[]): { rows: { c: string; t: string }[]; skipped: number } {
  const none = { rows: [], skipped: lines.length }
  const headerIndex = lines.findIndex(
    (l) => /(emp|user|enrol|pin|ac[\s-]*no|\bid\b|code|\bno\b)/i.test(l) && /(date|time)/i.test(l)
  )
  if (headerIndex === -1) return none
  // The separator is whichever the header row uses most, not the title above it.
  const headerLine = lines[headerIndex]!
  const delimiter = [',', ';', '\t'].sort((a, b) => headerLine.split(b).length - headerLine.split(a).length)[0]!
  const header = splitCsvLine(headerLine, delimiter).map((h) => h.toLowerCase())

  const codeCol = header.findIndex((h) => /(emp|user|enrol|pin|ac[\s-]*no|card|code)/.test(h) && !/name/.test(h))
  const fallbackCode = header.findIndex((h) => /^(id|no\.?|sr|s\.no)$/.test(h))
  const code = codeCol !== -1 ? codeCol : fallbackCode
  const dateTimeCol = header.findIndex((h) => /date.?time|punch.?time|check.?time|log.?time|timestamp/.test(h))
  const dateCol = header.findIndex((h) => /date/.test(h) && !/time/.test(h))
  const timeCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /\b(in|out|time|punch|check)\b/.test(h) && !/date/.test(h) && !/(emp|user|name|late|early|over|work|total)/.test(h))
    .map(({ i }) => i)
  if (code === -1 || (dateTimeCol === -1 && (dateCol === -1 || timeCols.length === 0))) return none

  const rows: { c: string; t: string }[] = []
  let skipped = 0
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitCsvLine(line, delimiter)
    const c = (cells[code] ?? '').replace(/\.0+$/, '').trim()
    if (!/^[0-9A-Za-z]{1,24}$/.test(c)) {
      skipped++
      continue
    }
    if (dateTimeCol !== -1) {
      const t = readDateTime(cells[dateTimeCol] ?? '')
      if (t) rows.push({ c, t })
      else skipped++
      continue
    }
    // A report with a date and one or more time columns (In, Out, In 2…).
    const date = readDate(cells[dateCol] ?? '')
    if (!date) {
      skipped++
      continue
    }
    let any = false
    for (const col of timeCols) {
      for (const piece of (cells[col] ?? '').split(/[,|]/)) {
        const t = readTime(piece)
        if (t) {
          rows.push({ c, t: `${date} ${t}` })
          any = true
        }
      }
    }
    if (!any) skipped++
  }
  return { rows, skipped }
}
