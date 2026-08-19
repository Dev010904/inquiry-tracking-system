/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Chromium is left out of the bundler entirely.
   *
   * @sparticuz/chromium ships the browser as brotli archives it unpacks at
   * runtime. Webpack cannot follow that, and bundling it produces a function
   * that builds cleanly and then cannot find its own binary in production.
   * Marked external so the files are traced and copied as they are.
   */
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  /**
   * And its binaries are copied into the PDF function explicitly.
   *
   * Marking the package external stops webpack bundling it, but the tracer
   * follows `require` calls and these are not required — they are brotli
   * archives the package unpacks into /tmp at runtime. Without this the
   * function ships the JavaScript and none of the browser, and Chromium
   * starts far enough to fail on `libnss3.so`, which lives in al2023.tar.br.
   */
  outputFileTracingIncludes: {
    '/api/documents/[id]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
