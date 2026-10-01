/**
 * Response headers for every route.
 *
 * The Content-Security-Policy is not here: it carries a per-request nonce, so
 * it is set by the middleware (src/lib/supabase/middleware.ts) instead.
 */
const securityHeaders = [
  // Never framed — clickjacking a signed-in session is how a "press this
  // button" attack works. frame-ancestors in the CSP says the same for
  // browsers that read it.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // An internal system: no other site needs to learn which record somebody
  // had open when they followed a link out of it.
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Vercel already sends this on *.vercel.app; stated here so a custom domain
  // gets it too.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Nothing in the app uses these. The QA photo picker opens the phone's own
  // camera through the file input, which this does not affect.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Nothing renders next/image (the logo is an inline SVG), so the image
    // optimiser at /_next/image was a public endpoint with no user — and the
    // part of Next.js with the worst security record. Turned off, it is gone.
    unoptimized: true,
  },
  // The signature is read from disk by its route handler rather than served
  // from /public; this makes sure the file is shipped with that function.
  outputFileTracingIncludes: {
    '/assets/signature': ['./src/assets/signature.png'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
