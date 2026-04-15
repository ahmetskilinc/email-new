import { getEmailAliases } from "@/lib/api"
import { useQuery } from "@tanstack/react-query"

export function useEmailAliases() {
  return useQuery({
    queryKey: ["emailAliases"],
    queryFn: () => getEmailAliases(),
    staleTime: 1000 * 60 * 60,
  })
}
