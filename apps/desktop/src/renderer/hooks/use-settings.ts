import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export const useSettings = () => {
  const { data: session } = useSession()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ["settings", userId ?? "anon"],
    queryFn: () => window.api.settings.get(),
    enabled: !!userId,
  })
}

export const useSaveSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: unknown) => window.api.settings.save(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
    },
  })
}
