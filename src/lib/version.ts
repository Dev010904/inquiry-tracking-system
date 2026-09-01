/**
 * What version of this system is running.
 *
 * Set by hand, one minor number per round of work the owner reviewed and
 * signed off — not per commit, and not automatically. 1.0 was the first
 * working system in August 2026.
 *
 * `package.json` carries the same number. npm needs a literal there, so it
 * cannot import this; when you change it here, change it there too.
 */
export const APP_VERSION = '1.8'

/** The day that version went live. Moves with APP_VERSION, never on its own. */
export const APP_VERSION_DATE = '2026-09-01'
