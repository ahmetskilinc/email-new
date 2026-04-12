/**
 * Desktop replacement for apps/web/lib/auth-client.ts (better-auth/react).
 *
 * In the desktop app there are no cookies or HTTP sessions.
 * The local user is stored in SQLite and fetched via IPC.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useSession() {
  const { data, isLoading } = useQuery({
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
  }
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return async () => {
    await window.api.auth.deleteUser()
    queryClient.invalidateQueries({ queryKey: ["session"] })
  }
}
