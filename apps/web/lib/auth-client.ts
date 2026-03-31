"use client"

import { createAuthClient } from "better-auth/react"

const getBaseURL = () => {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

export const authClient: ReturnType<typeof createAuthClient> =
  createAuthClient({
    baseURL: getBaseURL(),
  })

export const { useSession, signIn, signUp, signOut } = authClient
