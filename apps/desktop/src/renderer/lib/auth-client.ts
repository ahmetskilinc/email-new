/**
 * Desktop replacement for apps/web/lib/auth-client.ts (better-auth/react).
 *
 * In the desktop app there are no cookies or HTTP sessions.
 * The local user is stored in SQLite and fetched via IPC.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useSession() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const user = await window.api.auth.getUser()
      if (!user) return null
      return { user }
    },
    staleTime: Infinity,
  })

  return {
    data: data ?? null,
    isPending: isLoading,
    refetch,
  }
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return async () => {
    await window.api.auth.deleteUser()
    queryClient.invalidateQueries({ queryKey: ["session"] })
  }
}

/**
 * Convenience wrapper so components can `import { signOut } from "@/lib/auth-client"`.
 * Delegates to the IPC layer directly (no React context needed).
 */
export async function signOut() {
  await window.api.auth.deleteUser()
}

/**
 * Stub authClient that mirrors the subset of better-auth's client API
 * used across shared components. In the desktop app these operations
 * are either handled via IPC or are no-ops.
 */
export const authClient = {
  /** OAuth link — opens the provider's OAuth flow via the main process. */
  async linkSocial(_opts: { provider: string; callbackURL?: string }) {
    // TODO: implement desktop OAuth flow via IPC / system browser
    console.warn("[desktop] authClient.linkSocial is not yet implemented")
  },

  /** Update user profile fields (e.g. name). */
  async updateUser(fields: { name?: string }) {
    await window.api.auth.updateUser(fields)
  },

  /** Change password — desktop users authenticate locally. */
  async changePassword(opts: {
    currentPassword: string
    newPassword: string
    revokeOtherSessions?: boolean
  }): Promise<{ error?: { message: string } }> {
    try {
      await window.api.auth.changePassword(opts)
      return {}
    } catch (err: any) {
      return { error: { message: err?.message ?? "Failed to change password" } }
    }
  },
}
