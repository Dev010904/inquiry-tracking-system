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
