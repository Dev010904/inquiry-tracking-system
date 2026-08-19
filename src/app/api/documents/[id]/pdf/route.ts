import { NextResponse, type NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth'
import { getDocument } from '@/lib/queries/documents'

/**
 * A PDF of a document, rendered on the server.
 *
 * Browser print puts the browser's own header and footer on the page whenever
 * that checkbox is ticked — a date, the page title and the app's URL, printed
 * across documents that go to customers. It is a per-browser setting, so it
 * has to be found and turned off again on every machine every member of staff
 * uses. This route is the answer: no chrome, ever, for everyone.
 *
 * It renders `/print/documents/[id]` headlessly rather than rebuilding the
 * document. That route is the same `PrintableDocument` the screen shows, so
 * paper and screen cannot drift apart — which was the whole reason browser
 * print was chosen in the first place.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Chromium takes several seconds to start cold. The Vercel default of 10s is
// not enough for the first request after a deploy.
export const maxDuration = 60

/** A document number is not a filename — `QT/2026-27/0001` has slashes in it. */
function fileNameFor(docNo: string | null, docType: string): string {
  const base = (docNo ?? `${docType}-draft`).replace(/[^A-Za-z0-9._-]+/g, '-')
  return `${base}.pdf`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Re-checked here. A route handler is a public endpoint reachable by anyone
  // who knows the id, whether or not they could ever open the screen that
  // links to it.
  await requireProfile()

  const detail = await getDocument(id)
  if (!detail) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const copies = request.nextUrl.searchParams.get('copies') ?? 'original'

  let browser
  try {
    // Imported inside the handler so the ~76MB of Chromium never loads on any
    // other route's cold start.
    const puppeteer = (await import('puppeteer-core')).default
    const chromium = (await import('@sparticuz/chromium')).default

    const onVercel = Boolean(process.env.VERCEL)

    browser = await puppeteer.launch(
      onVercel
        ? {
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
          }
        : {
            // Local development: use whatever Chrome or Edge is installed
            // rather than shipping a second copy of the browser to every
            // developer machine.
            channel: 'chrome',
            headless: true,
          }
    )

    const page = await browser.newPage()

    // The print route is behind the same auth gate as everything else, so the
    // headless browser has to arrive holding the caller's session. Without
    // this it follows the middleware's redirect and renders the login screen
    // as a PDF.
    const cookie = request.headers.get('cookie')
    if (cookie) await page.setExtraHTTPHeaders({ cookie })

    const target = new URL(
      `/print/documents/${id}?copies=${encodeURIComponent(copies)}`,
      request.nextUrl.origin
    )

    const response = await page.goto(target.toString(), {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    })

    // A redirect to /login still returns 200 at the end of the chain, so the
    // URL is what proves the session travelled, not the status code.
    if (!response?.ok() || new URL(page.url()).pathname.startsWith('/login')) {
      return NextResponse.json(
        { error: 'Could not render the document. Sign in again and retry.' },
        { status: 502 }
      )
    }

    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      // The layout already sets its own 12mm @page margin and is measured
      // against it. Adding margins here would shrink the page box underneath
      // the layout and fragment every document onto a second sheet.
      preferCSSPageSize: true,
    })

    const fileName = fileNameFor(detail.invoice.doc_no, detail.invoice.doc_type)

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        // A document can be cancelled or its draft edited; never hand back a
        // stale copy of something a customer is about to be sent.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('PDF render failed', error)
    return NextResponse.json(
      { error: 'Could not build the PDF. Use Print / Save as PDF instead.' },
      { status: 500 }
    )
  } finally {
    await browser?.close()
  }
}
