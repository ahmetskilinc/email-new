import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useActiveConnection } from "./use-connections"

export const useSignatures = (connectionId?: string) => {
  const { data: activeConnection } = useActiveConnection()
  const resolvedConnectionId = connectionId ?? activeConnection?.id

  return useQuery({
    queryKey: ["signatures", resolvedConnectionId],
    queryFn: () => window.api.signatures.list(resolvedConnectionId),
    enabled: !!resolvedConnectionId,
  })
}

export const useCreateSignature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { connectionId: string; name: string; body: string; isDefault?: boolean }) =>
      window.api.signatures.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signatures"] })
    },
  })
}

export const useDeleteSignature = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.signatures.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signatures"] })
    },
  })
}
