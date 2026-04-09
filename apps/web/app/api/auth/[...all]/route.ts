import { auth } from "@/server/lib/auth"

export const dynamic = "force-dynamic"

async function handler(request: Request) {
  const response = await auth.handler(request)
  // Clone response and explicitly copy all headers including Set-Cookie
  // to ensure Next.js 16 doesn't strip them
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
  return newResponse
}

export { handler as GET, handler as POST }
