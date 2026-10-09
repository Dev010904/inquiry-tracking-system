'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbMessage } from '@/lib/db-message'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { normCode } from '@/lib/attendance/labels'
import { istInstant, istToday, isIsoDate, timeToMinutes } from '@/lib/attendance/time'
import type { ProfileRow } from '@/types/database'

export type AttendanceResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const ONLY_ADMIN = { ok: false as const, error: 'Only an admin can do this.' }

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function invalid(error: z.ZodError): AttendanceResult {
  return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(error) }
}

function refresh() {
  revalidatePath('/attendance', 'layout')
}

/**
 * The caller if they may use Attendance at all (their own requests).
 * Managing it — people, rules, devices, decisions — also needs admin, and the
 * database says the same in every policy and function (migration 9_01).
 */
async function member(): Promise<ProfileRow | null> {
  return editorOrNull('attendance')
}

async function admin(): Promise<ProfileRow | null> {
  const profile = await member()
  return profile && profile.role === 'admin' ? profile : null
}

const uuid = z.string().uuid()
const date = z.string().refine(isIsoDate, 'Pick a date')
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time')
const optionalTime = z.union([time, z.literal('')])
const code = z
  .string()
  .trim()
  .min(1, 'Enter the number on the device')
  .max(24, 'Too long')
  .regex(/^[0-9A-Za-z]+$/, 'Letters and digits only, as on the device')
  .transform(normCode)

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const personSchema = z.object({
  profile_id: uuid,
  device_code: code,
  shift_id: uuid,
  tracked_from: date,
})

export async function addPerson(input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = personSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('attendance_people').insert(parsed.data)
  if (error) {
    if (error.code === '23505') {
      return error.message.includes('code')
        ? { ok: false, error: 'Someone else already has this device number.', fieldErrors: { device_code: 'Already used' } }
        : { ok: false, error: 'This person is already on attendance.' }
    }
    return { ok: false, error: 'Could not add this person.' }
  }
  refresh()
  return { ok: true }
}

const personUpdateSchema = z.object({
  device_code: code,
  shift_id: uuid,
  tracked_from: date,
  is_active: z.boolean(),
})

export async function updatePerson(id: string, input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown person.' }
  const parsed = personUpdateSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('attendance_people').update(parsed.data).eq('id', id)
  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'Someone else already has this device number.', fieldErrors: { device_code: 'Already used' } }
      : { ok: false, error: 'Could not save the changes.' }
  }
  refresh()
  return { ok: true }
}

export async function removePerson(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown person.' }
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_people').delete().eq('id', id)
  if (error) {
    return error.code === '23503'
      ? { ok: false, error: 'This person already has attendance records. Stop tracking instead — it keeps their history.' }
      : { ok: false, error: 'Could not remove this person.' }
  }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Shifts, holidays, leave types
// ---------------------------------------------------------------------------

const shiftSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the shift a name').max(40),
    start_time: time,
    end_time: time,
    grace_minutes: z.coerce.number().int().min(0).max(240),
    half_day_minutes: z.coerce.number().int().min(0).max(1440),
    full_day_minutes: z.coerce.number().int().min(1).max(1440),
    weekly_offs: z.array(z.number().int().min(1).max(7)).max(6, 'Leave at least one working day'),
    late_marks_per_half_day: z.coerce.number().int().min(0).max(31),
    overtime_after_minutes: z.coerce.number().int().min(0).max(600),
  })
  .refine((s) => timeToMinutes(s.end_time) > timeToMinutes(s.start_time), {
    message: 'The shift must end after it starts (night shifts are not supported yet)',
    path: ['end_time'],
  })
  .refine((s) => s.half_day_minutes <= s.full_day_minutes, {
    message: 'A half day cannot need more hours than a full day',
    path: ['half_day_minutes'],
  })

export async function saveShift(id: string | null, input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = shiftSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = id
    ? await supabase.from('attendance_shifts').update(parsed.data).eq('id', id)
    : await supabase.from('attendance_shifts').insert(parsed.data)
  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'There is already a shift with this name.', fieldErrors: { name: 'Already used' } }
      : { ok: false, error: 'Could not save the shift.' }
  }
  refresh()
  return { ok: true }
}

export async function deleteShift(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const supabase = await createClient()
  const { data: shift } = await supabase.from('attendance_shifts').select('is_default').eq('id', id).maybeSingle()
  if (shift?.is_default) return { ok: false, error: 'The default shift stays. Change its times instead.' }
  const { error } = await supabase.from('attendance_shifts').delete().eq('id', id)
  if (error) {
    return error.code === '23503'
      ? { ok: false, error: 'Someone is on this shift. Move them to another shift first.' }
      : { ok: false, error: 'Could not delete the shift.' }
  }
  refresh()
  return { ok: true }
}

const holidaySchema = z.object({
  holiday_on: date,
  name: z.string().trim().min(2, 'Name the holiday').max(80),
})

export async function saveHoliday(id: string | null, input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = holidaySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { error } = id
    ? await supabase.from('attendance_holidays').update(parsed.data).eq('id', id)
    : await supabase.from('attendance_holidays').insert(parsed.data)
  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'There is already a holiday on this date.', fieldErrors: { holiday_on: 'Already a holiday' } }
      : { ok: false, error: 'Could not save the holiday.' }
  }
  refresh()
  return { ok: true }
}

export async function deleteHoliday(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_holidays').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not delete the holiday.' }
  refresh()
  return { ok: true }
}

const leaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,5}$/, 'Up to 5 letters, like CL'),
  name: z.string().trim().min(2, 'Name the leave type').max(60),
  is_paid: z.boolean(),
  counts_as_present: z.boolean(),
  yearly_quota: z.union([z.coerce.number().min(0).max(366), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : v)),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(999),
})

export async function saveLeaveType(id: string | null, input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = leaveTypeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { code: typeCode, ...rest } = parsed.data
  const { error } = id
    ? await supabase.from('attendance_leave_types').update(rest).eq('id', id)
    : await supabase.from('attendance_leave_types').insert({ code: typeCode, ...rest })
  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'There is already a leave type with this code.', fieldErrors: { code: 'Already used' } }
      : { ok: false, error: 'Could not save the leave type.' }
  }
  refresh()
  return { ok: true }
}

export async function deleteLeaveType(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_leave_types').delete().eq('id', id)
  if (error) {
    return error.code === '23503'
      ? { ok: false, error: 'This leave type has been used. Turn it off instead, which keeps the records.' }
      : { ok: false, error: 'Could not delete the leave type.' }
  }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

const deviceSchema = z.object({
  serial_no: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z_-]{3,40}$/, 'The serial number from the device label or its System info screen'),
  name: z.string().trim().min(2, 'Name the device, for example "Office entrance"').max(60),
})

export async function addDevice(input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = deviceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_devices').insert({ ...parsed.data, status: 'active' })
  if (error) {
    return error.code === '23505'
      ? { ok: false, error: 'This device is already listed.', fieldErrors: { serial_no: 'Already listed' } }
      : { ok: false, error: 'Could not add the device.' }
  }
  refresh()
  return { ok: true }
}

const deviceUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  status: z.enum(['pending', 'active', 'blocked']),
  token_required: z.boolean(),
})

export async function updateDevice(id: string, input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown device.' }
  const parsed = deviceUpdateSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_devices').update(parsed.data).eq('id', id)
  if (error) return { ok: false, error: 'Could not save the device.' }
  refresh()
  return { ok: true }
}

export async function removeDevice(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_devices').delete().eq('id', id)
  if (error) return { ok: false, error: 'Could not remove the device.' }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Leave and corrections
// ---------------------------------------------------------------------------

async function ownPersonId(profileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('attendance_people').select('id').eq('profile_id', profileId).maybeSingle()
  return data?.id ?? null
}

const leaveSchema = z
  .object({
    person_id: uuid.optional().or(z.literal('')),
    leave_type_id: uuid,
    from_date: date,
    to_date: date,
    half_day: z.boolean(),
    reason: z.string().trim().max(500).optional().or(z.literal('')),
    approve_now: z.boolean().optional(),
  })
  .refine((l) => l.to_date >= l.from_date, { message: 'The last day cannot be before the first', path: ['to_date'] })
  .refine((l) => !l.half_day || l.from_date === l.to_date, { message: 'A half day is one day', path: ['to_date'] })

export async function applyLeave(input: unknown): Promise<AttendanceResult> {
  const profile = await member()
  if (!profile) return NO_FEATURE_ACCESS
  const parsed = leaveSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const isAdmin = profile.role === 'admin'

  const personId = isAdmin && v.person_id ? v.person_id : await ownPersonId(profile.id)
  if (!personId) return { ok: false, error: 'You are not on attendance yet. Ask an admin to add you.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance_leaves')
    .insert({
      person_id: personId,
      leave_type_id: v.leave_type_id,
      from_date: v.from_date,
      to_date: v.to_date,
      half_day: v.half_day,
      reason: v.reason || null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not send the leave request.') }

  if (isAdmin && v.approve_now) {
    const { error: decideError } = await supabase.rpc('attendance_decide_leave', { p_id: data.id, p_approve: true, p_note: null })
    if (decideError) return { ok: false, error: dbMessage(decideError.message, 'Saved, but could not approve it.') }
  }
  refresh()
  return { ok: true, message: isAdmin && v.approve_now ? 'Leave added and approved' : 'Leave request sent' }
}

const correctionSchema = z
  .object({
    person_id: uuid.optional().or(z.literal('')),
    work_date: date,
    punch_in: optionalTime,
    punch_out: optionalTime,
    reason: z.string().trim().min(3, 'Say what happened').max(500),
    approve_now: z.boolean().optional(),
  })
  .refine((c) => c.punch_in || c.punch_out, { message: 'Enter the in time, the out time, or both', path: ['punch_in'] })
  .refine((c) => !c.punch_in || !c.punch_out || c.punch_out > c.punch_in, { message: 'Out must be after in', path: ['punch_out'] })
  .refine((c) => c.work_date <= istToday(), { message: 'A correction is for a day that has happened', path: ['work_date'] })

export async function requestCorrection(input: unknown): Promise<AttendanceResult> {
  const profile = await member()
  if (!profile) return NO_FEATURE_ACCESS
  const parsed = correctionSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const isAdmin = profile.role === 'admin'

  const personId = isAdmin && v.person_id ? v.person_id : await ownPersonId(profile.id)
  if (!personId) return { ok: false, error: 'You are not on attendance yet. Ask an admin to add you.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('attendance_corrections')
    .insert({
      person_id: personId,
      work_date: v.work_date,
      punch_in: v.punch_in || null,
      punch_out: v.punch_out || null,
      reason: v.reason,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not send the correction.') }

  if (isAdmin && v.approve_now) {
    const { error: decideError } = await supabase.rpc('attendance_decide_correction', { p_id: data.id, p_approve: true, p_note: null })
    if (decideError) return { ok: false, error: dbMessage(decideError.message, 'Saved, but could not approve it.') }
  }
  refresh()
  return { ok: true, message: isAdmin && v.approve_now ? 'Punch added' : 'Correction sent for approval' }
}

export async function cancelRequest(kind: 'leave' | 'correction', id: string): Promise<AttendanceResult> {
  if (!(await member())) return NO_FEATURE_ACCESS
  if (!['leave', 'correction'].includes(kind) || !uuid.safeParse(id).success) return { ok: false, error: 'Unknown request.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('attendance_cancel_request', { p_kind: kind, p_id: id })
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not withdraw the request.') }
  refresh()
  return { ok: true }
}

const noteSchema = z.string().trim().max(300).optional().or(z.literal(''))

/** approve: true / false, or null to cancel an approved leave. */
export async function decideLeave(id: string, approve: boolean | null, note?: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown request.' }
  const n = noteSchema.safeParse(note)
  const supabase = await createClient()
  const { error } = await supabase.rpc('attendance_decide_leave', { p_id: id, p_approve: approve, p_note: (n.success && n.data) || null })
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not save the decision.') }
  refresh()
  return { ok: true }
}

export async function decideCorrection(id: string, approve: boolean, note?: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown request.' }
  const n = noteSchema.safeParse(note)
  const supabase = await createClient()
  const { error } = await supabase.rpc('attendance_decide_correction', { p_id: id, p_approve: approve, p_note: (n.success && n.data) || null })
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not save the decision.') }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// An admin's hand on one day: a punch, or a ruling
// ---------------------------------------------------------------------------

const manualPunchSchema = z.object({
  person_id: uuid,
  date,
  time,
  note: z.string().trim().min(3, 'Say why this punch is being added').max(300),
})

export async function addManualPunch(input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = manualPunchSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('attendance_add_manual_punch', {
    p_person: v.person_id,
    p_at: istInstant(v.date, timeToMinutes(v.time)),
    p_note: v.note,
  })
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not add the punch.') }
  refresh()
  return { ok: true }
}

export async function deletePunch(id: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Unknown punch.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('attendance_delete_punch', { p_id: id })
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not remove the punch.') }
  refresh()
  return { ok: true }
}

const overrideSchema = z
  .object({
    person_id: uuid,
    work_date: date,
    status: z.enum(['present', 'half_day', 'absent', 'leave', 'on_duty', 'holiday', 'weekly_off']),
    leave_type_id: uuid.optional().or(z.literal('')),
    note: z.string().trim().min(3, 'Say why the day is being marked').max(300),
  })
  .refine((o) => o.status !== 'leave' || !!o.leave_type_id, { message: 'Pick the leave type', path: ['leave_type_id'] })

export async function setDayOverride(input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = overrideSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const leaveTypeId = v.status === 'leave' ? v.leave_type_id || null : null

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('attendance_day_overrides')
    .select('id')
    .eq('person_id', v.person_id)
    .eq('work_date', v.work_date)
    .maybeSingle()
  // Not an upsert: staff hold no UPDATE right on person or date, and an upsert
  // would ask for it.
  const { error } = existing
    ? await supabase
        .from('attendance_day_overrides')
        .update({ status: v.status, leave_type_id: leaveTypeId, note: v.note })
        .eq('id', existing.id)
    : await supabase.from('attendance_day_overrides').insert({
        person_id: v.person_id,
        work_date: v.work_date,
        status: v.status,
        leave_type_id: leaveTypeId,
        note: v.note,
      })
  if (error) return { ok: false, error: 'Could not mark the day.' }
  refresh()
  return { ok: true }
}

export async function clearDayOverride(personId: string, workDate: string): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  if (!uuid.safeParse(personId).success || !isIsoDate(workDate)) return { ok: false, error: 'Unknown day.' }
  const supabase = await createClient()
  const { error } = await supabase.from('attendance_day_overrides').delete().eq('person_id', personId).eq('work_date', workDate)
  if (error) return { ok: false, error: 'Could not clear the mark.' }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// A USB-only device's file
// ---------------------------------------------------------------------------

const importSchema = z.object({
  label: z.string().trim().max(120),
  rows: z
    .array(z.object({ c: z.string().max(24), t: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) }))
    .min(1, 'The file has no punches in it')
    .max(20000, 'The file has more than 20,000 punches; split it by month'),
})

export async function importPunches(input: unknown): Promise<AttendanceResult> {
  if (!(await admin())) return ONLY_ADMIN
  const parsed = importSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'The file could not be read.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('attendance_import_punches', {
    p_rows: parsed.data.rows,
    p_label: `Imported from ${parsed.data.label || 'a file'}`.slice(0, 300),
  })
  if (error || !data) return { ok: false, error: dbMessage(error?.message ?? '', 'Could not import the file.') }
  refresh()
  const parts = [`${data.inserted} new punch${data.inserted === 1 ? '' : 'es'}`]
  if (data.duplicates) parts.push(`${data.duplicates} already here`)
  if (data.invalid) parts.push(`${data.invalid} unreadable`)
  return { ok: true, message: `Imported: ${parts.join(', ')}` }
}
