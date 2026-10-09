'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Loader2, Plus, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { addDevice, importPunches, removeDevice, updateDevice, type AttendanceResult } from '@/lib/actions/attendance'
import { parsePunchFile, type ParsedFile } from '@/lib/attendance/import-file'
import { DEVICE_STATUS } from '@/lib/attendance/labels'
import type { AttendanceDeviceRow } from '@/types/database'

export type DeviceView = AttendanceDeviceRow & { seen: { text: string; online: boolean } }

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  return {
    pending,
    errors,
    run(fn: () => Promise<AttendanceResult>, success: string, after?: () => void) {
      start(async () => {
        const result = await fn()
        if (result.ok) {
          toast.success(result.message ?? success)
          setErrors({})
          after?.()
          router.refresh()
        } else {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
        }
      })
    },
  }
}

const STATUS_VARIANT = { pending: 'duesoon', active: 'ok', blocked: 'overdue' } as const

/**
 * The fingerprint devices. A network device that calls in appears here as
 * "waiting for approval" and its punches are refused until an admin approves
 * it; a device can also be added by its serial number before it is installed.
 */
export function SetupDevices({ devices, host }: { devices: DeviceView[]; host: string }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ serial_no: '', name: 'Office entrance' })
  const [renaming, setRenaming] = useState<DeviceView | null>(null)
  const [newName, setNewName] = useState('')
  const { pending, errors, run } = useRun()

  const save = (d: DeviceView, patch: Partial<Pick<AttendanceDeviceRow, 'name' | 'status' | 'token_required'>>, success: string) =>
    run(() => updateDevice(d.id, { name: d.name, status: d.status, token_required: d.token_required, ...patch }), success)

  return (
    <Card id="devices">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Fingerprint devices</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Fingerprints stay on the device. Only the employee number and the time reach this system.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add by serial number
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {devices.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No device has connected yet. Set it up with the details below; it appears here the moment it calls in.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {d.name}
                    <Badge variant={STATUS_VARIANT[d.status]}>{DEVICE_STATUS[d.status]}</Badge>
                    {d.token_required && <Badge variant="secondary">Token required</Badge>}
                  </p>
                  <p className="text-muted-foreground">
                    Serial {d.serial_no}
                    {d.last_info ? ` · ${d.last_info}` : ''}
                  </p>
                  <p className={d.seen.online ? 'flex items-center gap-1 text-ok' : 'flex items-center gap-1 text-muted-foreground'}>
                    {d.seen.online ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
                    {d.seen.text}
                    {d.last_ip ? ` · from ${d.last_ip}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.status !== 'active' && (
                    <Button size="sm" disabled={pending} onClick={() => save(d, { status: 'active' }, 'Device approved — its punches will now come in')}>
                      Approve
                    </Button>
                  )}
                  {d.status !== 'blocked' && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => save(d, { status: 'blocked' }, 'Device blocked')}>
                      Block
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewName(d.name)
                      setRenaming(d)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => save(d, { token_required: !d.token_required }, d.token_required ? 'Token no longer required' : 'Token now required')}
                  >
                    {d.token_required ? 'Stop requiring token' : 'Require token'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove ${d.name}? Its punches stay; if it calls in again it waits for approval.`)) run(() => removeDevice(d.id), 'Device removed')
                    }}
                  >
                    Remove
                  </Button>
                </div>
                {d.token_required && (
                  <p className="w-full text-xs text-muted-foreground lg:hidden">
                    Server address with token: <code className="rounded bg-muted px-1">{host}/d/{d.push_token}</code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Connecting a network device (eSSL, ZKTeco or Realtime with ADMS / Cloud Server)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>On the device: Menu → Comm. (Communication) → Cloud Server Setting (some models: ADMS).</li>
            <li>
              Server address: <code className="rounded bg-card px-1 text-foreground">{host}</code> · Server port:{' '}
              <code className="rounded bg-card px-1 text-foreground">443</code> · HTTPS / SSL: <strong>On</strong> · Enable
              domain name: <strong>On</strong>. Proxy: off.
            </li>
            <li>Check the device&rsquo;s date and time are India time (Menu → System → Date/Time).</li>
            <li>The device appears in the list above within a minute. Press Approve, and its punches come in from then on.</li>
            <li>Enrol each person&rsquo;s finger on the device under the same number you give them in People on attendance.</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            The device must support HTTPS for its cloud connection — ask the dealer for &ldquo;ADMS with HTTPS&rdquo; before
            buying. For extra safety, press Require token and give the device the address with its token instead
            ({host}/d/&lt;token&gt;, shown on the device&rsquo;s row).
          </p>
          {devices.some((d) => d.token_required) && (
            <ul className="mt-2 space-y-1 text-xs">
              {devices
                .filter((d) => d.token_required)
                .map((d) => (
                  <li key={d.id}>
                    {d.name}: <code className="rounded bg-card px-1">{host}/d/{d.push_token}</code>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <ImportFile />
      </CardContent>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a device by its serial number" description="It is approved straight away.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => addDevice(form), 'Device added', () => setAdding(false))
          }}
        >
          <Field label="Serial number" htmlFor="dev-sn" error={errors.serial_no} hint="On the label, or Menu → System Info → Device Info" required>
            <Input id="dev-sn" maxLength={40} value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="dev-name" error={errors.name} required>
            <Input id="dev-name" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Add device
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename device">
        {renaming && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(
                () => updateDevice(renaming.id, { name: newName, status: renaming.status, token_required: renaming.token_required }),
                'Device renamed',
                () => setRenaming(null)
              )
            }}
          >
            <Field label="Name" htmlFor="dev-rename" required>
              <Input id="dev-rename" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}

/**
 * For a device with no network: copy its attendance log to a pen drive
 * (Menu → USB Manager → Download → Attendance data) and upload the file here.
 * The file is read in the browser; only the numbers and times are sent.
 */
function ImportFile() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; parsed: ParsedFile } | null>(null)
  const { pending, run } = useRun()

  async function choose(f: File | undefined) {
    if (!f) return
    if (f.size > 5_000_000) {
      toast.error('That file is larger than 5 MB. Export one month at a time.')
      return
    }
    if (/\.xlsx?$/i.test(f.name)) {
      toast.error('Open the Excel file and use File → Save as → CSV, then upload the CSV.')
      return
    }
    const parsed = parsePunchFile(await f.text())
    if (parsed.rows.length === 0) toast.error('No punches found in that file. Is it the attendance log from the device?')
    setFile({ name: f.name, parsed })
  }

  return (
    <div className="rounded-md border p-4 text-sm">
      <p className="font-medium">Import from a pen drive (devices without internet)</p>
      <p className="mt-1 text-muted-foreground">
        On the device: Menu → USB Manager (or Pen drive) → Download → Attendance data. Upload the file it writes (.dat, .txt
        or .csv). Punches already in the system are skipped, so the same file can be uploaded twice safely.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".dat,.txt,.csv,.log,text/plain,text/csv"
          className="hidden"
          onChange={(e) => {
            void choose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden />
          Choose file
        </Button>
        {file && (
          <span className="text-muted-foreground">
            {file.name}: {file.parsed.rows.length} punch{file.parsed.rows.length === 1 ? '' : 'es'}
            {file.parsed.first && ` from ${file.parsed.first.slice(0, 10)} to ${file.parsed.last?.slice(0, 10)}`}
            {file.parsed.codes.length > 0 && ` · numbers ${file.parsed.codes.slice(0, 8).join(', ')}${file.parsed.codes.length > 8 ? '…' : ''}`}
            {file.parsed.skipped > 0 && ` · ${file.parsed.skipped} line${file.parsed.skipped === 1 ? '' : 's'} skipped`}
          </span>
        )}
      </div>
      {file && file.parsed.rows.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => importPunches({ label: file.name, rows: file.parsed.rows }), 'Imported', () => setFile(null))}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Import {file.parsed.rows.length} punches
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
