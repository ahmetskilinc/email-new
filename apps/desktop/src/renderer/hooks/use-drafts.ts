import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useActiveConnection } from "./use-connections"

export const useDrafts = () => {
  const { data: activeConnection } = useActiveConnection()

  return useQuery({
    queryKey: ["drafts", activeConnection?.id],
    queryFn: () => window.api.drafts.list(),
    enabled: !!activeConnection,
  })
}

export const useCreateDraft = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => window.api.drafts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] })
    },
  })
}
