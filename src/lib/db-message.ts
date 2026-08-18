import 'server-only'

/**
 * Surfaces a database refusal to the person who caused it.
 *
 * The guards in Postgres are written as sentences for exactly this reason —
 * "This order cannot be dispatched yet: it needs a QA check marked passed,
 * with a description, at least one photo and at least one video." Replacing
 * that with "Could not save your changes." throws away the only thing that
 * tells someone what to do next.
 *
 * Length-capped and only used where the guards are ours: a connection failure
 * or a policy violation produces something long and internal, and that falls
 * back to the caller's own wording rather than leaking schema detail.
 */
export function dbMessage(message: string, fallback: string): string {
  const cleaned = message.replace(/^ERROR:\s*/i, '').trim()
  return cleaned.length > 0 && cleaned.length < 300 ? cleaned : fallback
}
