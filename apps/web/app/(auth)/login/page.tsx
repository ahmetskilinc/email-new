"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useState } from "react"
import { signIn } from "@/lib/auth-client"
import { toast } from "sonner"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await signIn.email({
        email,
        password,
        fetchOptions: {
          onSuccess: (ctx) => {
            console.log("[auth] signIn success, status:", ctx.response.status)
            console.log("[auth] set-cookie headers:", ctx.response.headers.get("set-cookie"))
            console.log("[auth] document.cookie:", document.cookie)
            console.log("[auth] response data:", ctx.data)
            window.location.href = "/mail/inbox"
          },
          onError: (ctx) => {
            console.error("[auth] signIn error:", ctx.error)
            toast.error(ctx.error.message ?? "Invalid email or password")
          },
        },
      })
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuth = (providerId: string) => {
    toast.promise(
      signIn.social({
        provider: providerId,
        callbackURL: `${window.location.origin}/mail/inbox`,
      }),
      { error: "Login redirect failed" }
    )
  }

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Log in to your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">
            Or continue with
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => handleOAuth("google")}
          >
            Continue with Google
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => handleOAuth("microsoft")}
          >
            Continue with Microsoft
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-foreground underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
