import { type NextRequest, NextResponse } from "next/server"

const protectedPaths = ["/mail", "/settings", "/onboarding"]
const authPaths = ["/login", "/signup"]

function getSessionCookieName(req: NextRequest) {
  const isDev =
    req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1"
  return isDev ? "better-auth-dev.session_token" : "better-auth.session_token"
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const sessionCookie = req.cookies.get(getSessionCookieName(req))
  const hasSession = !!sessionCookie?.value

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const isAuthPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL("/mail/inbox", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/mail/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/login",
    "/signup",
  ],
}
