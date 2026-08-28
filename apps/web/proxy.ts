import { type NextRequest, NextResponse } from "next/server"
import { getSessionCookie, getCookieCache } from "better-auth/cookies"
import { EMAIL_FRAME_BOOTSTRAP_HASH } from "@/lib/email-frame-bootstrap"
import {
  AUTH_SNAPSHOT_HEADER,
  encodeAuthSnapshot,
  type AuthSnapshot,
} from "@/lib/auth-snapshot"

const protectedPaths = [
  "/mail",
  "/settings",
  "/onboarding",
  "/calendar",
  "/contacts",
]
const authPaths = ["/login", "/signup"]

const isProd = process.env.NODE_ENV === "production"

// Mirrors advanced.useSecureCookies in server/lib/auth.ts — the cookie name
// carries a __Secure- prefix exactly when the app is served over https.
const useSecureCookies = !!process.env.BETTER_AUTH_URL?.startsWith("https://")

/**
 * Non-HttpOnly marker of who owns this browser profile's local caches. Read
 * by the query-cache persister at restore time so one user's persisted mail
 * can never rehydrate into another user's session. Deliberately just a user
 * id: it authorizes nothing and is already present in cached query data.
 */
const CACHE_OWNER_COOKIE = "zm-uid"

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
 * its own bootstrap scripts, so production needs no 'unsafe-inline'. That only
 * works while every document is rendered per request, which is why the root
 * layout opts the whole app into dynamic rendering: a page prerendered at build
 * time has no nonce on its script tags, and this policy would blank it.
 */
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    // 'unsafe-eval' is required by the Turbopack dev runtime only.
    // The message-frame bootstrap is hashed rather than nonced: a srcdoc
    // document inherits this policy on top of its own, so the hash has to be
    // allowed here too or the frame's only script never runs.
    `script-src 'self' 'nonce-${nonce}' '${EMAIL_FRAME_BOOTSTRAP_HASH}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    // Tailwind and next-themes inject inline style attributes and blocks.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    // wss: is same-origin sync traffic (/api/sync). Safari does not treat a
    // wss: upgrade as covered by 'self' on an https page, so it is explicit.
    `connect-src 'self' wss:`,
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
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
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

type ValidatedSession = {
  user: {
    id: string
    email: string
    name: string
    image?: string | null
    defaultConnectionId?: string | null
  }
  session: { expiresAt: Date | string }
}

/**
 * Validates the session server-side, before anything renders.
 *
 * Fast path: the signed better-auth session_data cookie (60s cache) is
 * verified cryptographically — pure Web Crypto, no I/O. On a miss with a
 * session_token still present, fall back to a full `auth.api.getSession`,
 * which hits the database but bypasses the /api/auth rate limiter entirely.
 * The auth module is imported lazily so the no-cookie hot path never pays
 * for its dependency graph.
 */
async function validateSession(req: NextRequest): Promise<{
  session: ValidatedSession | null
  setCookies: string[]
}> {
  const cached = await getCookieCache(req, {
    secret: process.env.BETTER_AUTH_SECRET,
    isSecure: useSecureCookies,
  }).catch(() => null)
  if (cached?.user) {
    return { session: cached as unknown as ValidatedSession, setCookies: [] }
  }

  if (!getSessionCookie(req)) return { session: null, setCookies: [] }

  try {
    const { auth } = await import("@/server/lib/auth")
    const result = await auth.api.getSession({
      headers: req.headers,
      returnHeaders: true,
    })
    return {
      session: (result?.response as ValidatedSession | null) ?? null,
      // getSession re-signs the cookie cache when it is close to expiry;
      // forward those Set-Cookie headers or the refresh is lost.
      setCookies: result?.headers?.getSetCookie() ?? [],
    }
  } catch {
    return { session: null, setCookies: [] }
  }
}

function setCacheOwnerCookie(res: NextResponse, uid: string | null) {
  if (uid) {
    res.cookies.set(CACHE_OWNER_COOKIE, uid, {
      path: "/",
      sameSite: "lax",
      secure: useSecureCookies,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
    })
  } else {
    res.cookies.delete(CACHE_OWNER_COOKIE)
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
  const isAuthPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  // Spoof protection: this header is proxy-authored only. Strip it from every
  // inbound request before optionally setting our own value below.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.delete(AUTH_SNAPSHOT_HEADER)

  let snapshot: AuthSnapshot | null = null
  let authSetCookies: string[] = []

  if (isProtected || isAuthPage) {
    const { session, setCookies } = await validateSession(req)
    authSetCookies = setCookies
    if (session?.user) {
      snapshot = {
        uid: session.user.id,
        email: session.user.email,
        name: session.user.name ?? "",
        image: session.user.image ?? null,
        dcid: session.user.defaultConnectionId ?? null,
        sxp: new Date(session.session.expiresAt).getTime(),
      }
    }
  }

  if (isProtected && !snapshot) {
    const res = withSecurityHeaders(
      NextResponse.redirect(new URL("/login", req.url)),
      null
    )
    setCacheOwnerCookie(res, null)
    return res
  }

  if (isAuthPage && snapshot) {
    const res = withSecurityHeaders(
      NextResponse.redirect(new URL("/mail/inbox", req.url)),
      null
    )
    setCacheOwnerCookie(res, snapshot.uid)
    return res
  }

  if (snapshot) {
    requestHeaders.set(AUTH_SNAPSHOT_HEADER, encodeAuthSnapshot(snapshot))
  }

  const nonce = crypto.randomUUID().replace(/-/g, "")
  const csp = buildCsp(nonce)

  // Next.js picks the nonce up from the request-side CSP header and applies it
  // to the scripts it injects; without this the strict policy would break them.
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)

  const res = withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    csp
  )
  if (snapshot) setCacheOwnerCookie(res, snapshot.uid)
  else if (isAuthPage) setCacheOwnerCookie(res, null)
  for (const cookie of authSetCookies) {
    res.headers.append("set-cookie", cookie)
  }
  return res
}

export const config = {
  matcher: [
    /*
     * Every document request, so the CSP and the other headers are actually
     * attached. Static assets, image-optimisation output, the auth handler and
     * the sync WebSocket upgrade are excluded: they are not documents, and
     * better-auth sets its own response headers.
     */
    "/((?!_next/static|_next/image|api/auth|api/sync|favicon.ico|sw.js|icon-.*\\.png).*)",
  ],
}
