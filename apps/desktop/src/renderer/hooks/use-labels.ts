import { useQuery } from "@tanstack/react-query"
import { useActiveConnection } from "./use-connections"

export const useLabels = () => {
  const { data: activeConnection } = useActiveConnection()

  return useQuery({
    queryKey: ["labels", activeConnection?.id],
    queryFn: () => window.api.labels.list(),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })
}
