import { type NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const protectedPaths = ["/mail", "/settings", "/onboarding"]
const authPaths = ["/login", "/signup"]

const isProd = process.env.NODE_ENV === "production"

/**
 * Content-Security-Policy for the application document.
 *
 * This is the backstop for the email-rendering surface: message bodies are
 * attacker-controlled, and while they now render inside a sandboxed iframe, any
 * future escape or any newly introduced raw-HTML sink should still be unable to
 * load off-origin script or exfiltrate to an attacker's host.
 *
 * `strict-dynamic` plus a per-request nonce is what makes this meaningful —
 * Next.js reads the nonce out of the request-side CSP header and stamps it onto
 * its own bootstrap scripts, so production needs no 'unsafe-inline'.
 */
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    // 'unsafe-eval' is required by the Turbopack dev runtime only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    // Tailwind and next-themes inject inline style attributes and blocks.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    // Message bodies render in a sandboxed srcdoc iframe (opaque origin).
    `frame-src 'self' blob:`,
    `media-src 'self' data: blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isProd ? [`upgrade-insecure-requests`] : []),
  ].join("; ")
}

function withSecurityHeaders(res: NextResponse, csp: string | null) {
  if (csp) res.headers.set("Content-Security-Policy", csp)
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  )
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  if (isProd) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    )
  }
  return res
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const sessionCookie = getSessionCookie(req)
  const hasSession = !!sessionCookie

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isProtected && !hasSession) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/login", req.url)),
      null
    )
  }

  const isAuthPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isAuthPage && hasSession) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/mail/inbox", req.url)),
      null
    )
  }

  const nonce = crypto.randomUUID().replace(/-/g, "")
  const csp = buildCsp(nonce)

  // Next.js picks the nonce up from the request-side CSP header and applies it
  // to the scripts it injects; without this the strict policy would break them.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)

  return withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    csp
  )
}

export const config = {
  matcher: [
    /*
     * Every document request, so the CSP and the other headers are actually
     * attached. Static assets, image-optimisation output and the auth handler
     * are excluded: they are not documents, and better-auth sets its own
     * response headers.
     */
    "/((?!_next/static|_next/image|api/auth|favicon.ico|sw.js|icon-.*\\.png).*)",
  ],
}
