#!/usr/bin/env node
/**
 * Database runner for migrations and verification queries.
 *
 * Reads SUPABASE_DB_URL from .env.local — a direct (port 5432) Postgres
 * connection with DDL rights. That file is gitignored and the connection
 * string is never printed, not even in error output: pg puts the host and
 * sometimes the whole DSN into error messages, so everything on its way to
 * the console goes through scrub() first.
 *
 * Usage:
 *   node scripts/db.mjs apply <file.sql>   apply a migration, recorded once
 *   node scripts/db.mjs run <file.sql>     run a file without recording it
 *   node scripts/db.mjs query "<sql>"      run a statement and print rows
 *   node scripts/db.mjs applied            list migrations already applied
 *
 * Migrations are recorded in public.schema_migrations by filename and content
 * hash. Applying the same file twice is refused rather than repeated, which
 * matters when a long unattended run is resumed part-way through. Editing a
 * file after it has been applied is also refused — the hash will not match,
 * and the fix for an applied migration is a new file, never an edit.
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import pg from 'pg'

const ENV_FILE = resolve(process.cwd(), '.env.local')

function loadConnectionString() {
  let raw
  try {
    raw = readFileSync(ENV_FILE, 'utf8')
  } catch {
    fail(`Cannot read ${ENV_FILE}. It must exist and hold SUPABASE_DB_URL.`)
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    if (trimmed.slice(0, eq).trim() !== 'SUPABASE_DB_URL') continue
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!value) break
    if (/:6543\//.test(value)) {
      fail(
        'SUPABASE_DB_URL points at port 6543 (transaction pooler), which cannot\n' +
          'run schema changes reliably. Use the port 5432 connection string.'
      )
    }
    return value
  }

  fail(
    'SUPABASE_DB_URL is not set in .env.local.\n' +
      'Add the direct (port 5432) connection string from\n' +
      'Supabase → Project Settings → Database → Connection string → URI.'
  )
}

/** Strip anything resembling credentials out of text bound for the console. */
function scrub(text, secret) {
  let out = String(text)
  if (secret) {
    out = out.split(secret).join('<connection string>')
    try {
      const password = decodeURIComponent(new URL(secret).password)
      if (password) out = out.split(password).join('<redacted>')
    } catch {
      /* not parseable as a URL; the whole-string replacement above still applies */
    }
  }
  return out.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '<connection string>')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function connect(connectionString) {
  const client = new pg.Client({
    connectionString,
    // Supabase terminates TLS at the pooler with a certificate that does not
    // chain to a root in Node's default store. The connection is still
    // encrypted; only the chain check is relaxed.
    ssl: { rejectUnauthorized: false },
    application_name: 'ank-its-migrations',
    statement_timeout: 120_000,
  })
  await client.connect()
  return client
}

const LEDGER = `
  create table if not exists public.schema_migrations (
    filename    text primary key,
    sha256      text not null,
    applied_at  timestamptz not null default now()
  );
  -- No policies, so PostgREST returns nothing to app clients. The migration
  -- connection owns the table and bypasses RLS.
  alter table public.schema_migrations enable row level security;
`

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function printRows(rows) {
  if (!rows || rows.length === 0) {
    console.log('(no rows)')
    return
  }
  console.table(rows)
}

async function main() {
  const [command, argument] = process.argv.slice(2)
  if (!command) fail('Usage: node scripts/db.mjs <apply|run|query|applied> [argument]')

  const connectionString = loadConnectionString()
  let client

  try {
    client = await connect(connectionString)

    if (command === 'query') {
      if (!argument) fail('query needs a SQL string')
      const result = await client.query(argument)
      const results = Array.isArray(result) ? result : [result]
      for (const r of results) {
        if (r.command === 'SELECT' || r.rows?.length) printRows(r.rows)
        else console.log(`${r.command} ${r.rowCount ?? ''}`.trim())
      }
      return
    }

    if (command === 'applied') {
      await client.query(LEDGER)
      const { rows } = await client.query(
        'select filename, applied_at from public.schema_migrations order by filename'
      )
      printRows(rows)
      return
    }

    if (command !== 'apply' && command !== 'run') fail(`Unknown command: ${command}`)
    if (!argument) fail(`${command} needs a path to a .sql file`)

    const path = resolve(process.cwd(), argument)
    const sql = readFileSync(path, 'utf8')
    const name = basename(path)
    const hash = sha256(sql)

    if (command === 'run') {
      await client.query(sql)
      console.log(`Ran ${name} (not recorded)`)
      return
    }

    await client.query(LEDGER)
    const { rows: prior } = await client.query(
      'select sha256, applied_at from public.schema_migrations where filename = $1',
      [name]
    )

    if (prior.length > 0) {
      if (prior[0].sha256 === hash) {
        console.log(`Already applied: ${name} (${prior[0].applied_at.toISOString()}) — skipping`)
        return
      }
      fail(
        `${name} was applied on ${prior[0].applied_at.toISOString()} but its contents have\n` +
          'changed since. An applied migration must never be edited — write a new file.'
      )
    }

    // The file carries its own transaction control where it needs it. A
    // multi-statement simple query is atomic by default, so a file without an
    // explicit begin/commit still applies all-or-nothing.
    await client.query(sql)
    await client.query(
      'insert into public.schema_migrations (filename, sha256) values ($1, $2)',
      [name, hash]
    )
    console.log(`Applied ${name}`)
  } catch (error) {
    console.error(scrub(error?.stack || error?.message || error, connectionString))
    process.exitCode = 1
  } finally {
    await client?.end().catch(() => {})
  }
}

await main()
