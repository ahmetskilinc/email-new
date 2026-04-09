import { type NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const protectedPaths = ["/mail", "/settings", "/onboarding"]
const authPaths = ["/login", "/signup"]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const sessionCookie = getSessionCookie(req)
  const hasSession = !!sessionCookie

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
