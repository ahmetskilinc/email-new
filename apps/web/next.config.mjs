import { withWorkflow } from "workflow/next"

const isProd = process.env.NODE_ENV === "production"

/**
 * Baseline headers for every response, including the ones the proxy matcher
 * skips (static assets, the service worker). The per-request CSP with its nonce
 * is set in proxy.ts, which is the only place that can generate one per
 * document.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  // Stack traces and original sources should not ship to the browser in prod.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default withWorkflow(nextConfig)
