import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client"
import {
  QueryCache,
  QueryClient,
  type InfiniteData,
} from "@tanstack/react-query"
import { get, set, del } from "idb-keyval"
import { useEffect, useMemo, type ReactNode } from "react"

function createIDBPersister(
  idbValidKey: IDBValidKey = "mail-query-cache",
): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, client)
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey)
    },
    removeClient: async () => {
      await del(idbValidKey)
    },
  }
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (query.meta?.noGlobalError === true) return
        console.error(
          `[query error] ${err.message || "Something went wrong"}`,
          query.queryKey,
        )
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
      },
    },
  })
}

let queryClient: QueryClient | undefined

function getQueryClient() {
  if (!queryClient) {
    queryClient = makeQueryClient()
  }
  return queryClient
}

const CACHE_BURST_KEY = "v1"

export function QueryProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getQueryClient(), [])
  const persister = useMemo(() => createIDBPersister(), [])

  // Refresh the thread list whenever the main-process background sync loop
  // reports a completed poll. We deliberately do a broad invalidation rather
  // than a surgical cache merge — react-query's dedup + staleTime keeps this
  // cheap, and the background sync only fires once per minute.
  useEffect(() => {
    const events = window.api?.events
    if (!events?.onMailSynced) return
    const unsubscribe = events.onMailSynced(() => {
      client.invalidateQueries({ queryKey: ["threads"] })
      client.invalidateQueries({ queryKey: ["mail-count"] })
    })
    return unsubscribe
  }, [client])

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: CACHE_BURST_KEY,
        maxAge: 1000 * 60 * 60 * 24,
      }}
      onSuccess={() => {
        const threadQueryKey = ["threads"]
        client.setQueriesData(
          { queryKey: threadQueryKey },
          (data: InfiniteData<unknown> | undefined) => {
            if (!data) return data
            return {
              pages: data.pages.slice(0, 3),
              pageParams: data.pageParams.slice(0, 3),
            }
          },
        )
        client.invalidateQueries({ queryKey: threadQueryKey })
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
