import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState<"google" | "microsoft" | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * After a successful connect we invalidate every query that depends on
   * session/connections so MailLayout re-evaluates with the new rows and
   * stops redirecting back here.
   */
  const refreshAfterConnect = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["session"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
      queryClient.invalidateQueries({ queryKey: ["activeConnection"] }),
    ])
  }

  const handleGoogleConnect = async () => {
    setLoading("google")
    setError(null)
    try {
      await window.api.auth.connectGoogle()
      await refreshAfterConnect()
      navigate("/mail/inbox")
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect Google account.",
      )
    } finally {
      setLoading(null)
    }
  }

  const handleMicrosoftConnect = async () => {
    setLoading("microsoft")
    setError(null)
    try {
      await window.api.auth.connectMicrosoft()
      await refreshAfterConnect()
      navigate("/mail/inbox")
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect Microsoft account.",
      )
    } finally {
      setLoading(null)
    }
  }

  const busy = loading !== null

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome to Tulli</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in with your existing email account to get started.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleGoogleConnect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading === "google" ? "Connecting…" : "Sign in with Google"}
          </button>

          <button
            onClick={handleMicrosoftConnect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#00a4ef" d="M1 13h10v10H1z" />
              <path fill="#7fba00" d="M13 1h10v10H13z" />
              <path fill="#ffb900" d="M13 13h10v10H13z" />
            </svg>
            {loading === "microsoft" ? "Connecting…" : "Sign in with Microsoft"}
          </button>
        </div>
      </div>
    </div>
  )
}
