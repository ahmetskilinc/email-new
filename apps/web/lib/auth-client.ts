"use client"

import { createAuthClient } from "better-auth/react"

const getBaseURL = () => {
  if (typeof window !== "undefined") return window.location.origin
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient(
  {
    baseURL: getBaseURL(),
  }
)

export const { useSession, signIn, signUp, signOut } = authClient
