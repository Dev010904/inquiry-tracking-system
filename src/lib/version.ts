/**
 * What version of this system is running, and what each one changed.
 *
 * The numbering is not automatic and is not meant to be. It is a record of the
 * rounds of work the owner actually asked for and signed off, so that "which
 * version are we on" and "when did the invoice layout change" have an answer
 * on screen rather than in a git log nobody in the office can read.
 *
 * One minor number per round of work. A round is a batch the owner reviewed
 * together, not a commit — several commits usually make one entry, and a fix
 * to something inside the same round stays in that round.
 *
 * `package.json` carries the same number. npm needs a literal there, so it
 * cannot import this; when you add an entry here, change it there too.
 */

export type Release = {
  version: string
  /** ISO date the work went live. */
  date: string
  /** One line the owner would recognise. */
  summary: string
  /** The specific things, in the words used at the time. */
  changes: string[]
}

/**
 * Newest first — the order it is read in. `APP_VERSION` is taken from the top
 * of this list rather than written out separately, so the two cannot disagree.
 */
export const RELEASES: Release[] = [
  {
    version: '1.7',
    date: '2026-09-01',
    summary: 'Documents on inquiries, a Back that goes back, and the printed sheet tidied',
    changes: [
      'Documents section on the inquiry screen, between Requirement and Follow-ups',
      'Back now returns to the screen you came from, not to a fixed list',
      'Invoices renamed Documents, and the section opens on a type picker',
      'Payment due date replaces Valid till, and prints on quotations only',
      'Printed rules keep one weight on displays with fractional scaling',
      'The logo and every app icon show the full mark instead of a cropped one',
    ],
  },
  {
    version: '1.6',
    date: '2026-08-23',
    summary: 'Terms belong to the deal rather than to the company',
    changes: [
      'Payment terms and delivery timeline set per document, seeded from Settings',
      'Site installation chosen from a list that can be added to while writing',
      'Visit rate and number of visits as fields rather than as a fixed sentence',
      "The partner's signature and a computer-generated line on every document",
      'A client can be added from the Companies screen',
    ],
  },
  {
    version: '1.5',
    date: '2026-08-19',
    summary: 'Financial years, and printing that behaves',
    changes: [
      'Every series restarts on 1 April, and an admin can look back at a closed year',
      'The ledger — money received and money owed — reachable from the menu',
      'Printing goes through the browser, with proper margins on every sheet',
      'Line numbers follow position, so a removed line leaves no hole',
      'Every word on a document prints in the same ink',
    ],
  },
  {
    version: '1.4',
    date: '2026-08-18',
    summary: 'The printed document made real',
    changes: [
      "ANK's logo printed on documents, and the address stopped doubling its commas",
      'Documents fitted to the A4 page box without blocks tearing across a page',
      'The number series shown, and what issuing does spelled out',
      "A client's details editable so an invoice can be raised for them",
      'Inquiry and order numbers can no longer be lost',
    ],
  },
  {
    version: '1.3',
    date: '2026-08-17',
    summary: 'Money, roles and the quotation format',
    changes: [
      'Multi-currency on inquiries, orders and R&D',
      'GST set per line rather than at a flat 18 percent',
      'Quotations, invoices and challans built to the supplied format',
      'Admins can build roles that decide who sees which screens',
      'Work still to be done is tracked and locked to the person it belongs to',
    ],
  },
  {
    version: '1.2',
    date: '2026-08-13',
    summary: 'Security hardening',
    changes: [
      'The API gaps left by the Phase 2 functions closed',
      'The audit diff put out of reach of the application entirely',
      'Internal document helpers restricted from the REST API',
    ],
  },
  {
    version: '1.1',
    date: '2026-08-05',
    summary: 'Invoicing, quality and the audit trail',
    changes: [
      'Six document types with gapless numbering',
      'Order line items as the source of the order value',
      'Tax identity moved into configurable company settings',
      'QA dispatch gate, qualification records and minutes of meeting',
      'Staff-visible change history with exact IST timestamps',
    ],
  },
  {
    version: '1.0',
    date: '2026-08-03',
    summary: 'The first working system',
    changes: [
      'Inquiries, orders, follow-ups and the dashboard',
      'R&D projects and the IP portfolio',
      'Companies, contacts, reports and settings',
    ],
  },
]

/** The version running now. */
export const APP_VERSION = RELEASES[0]!.version

/** When it went live. */
export const APP_VERSION_DATE = RELEASES[0]!.date
