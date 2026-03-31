"use client"

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
import { CACHE_BURST_KEY } from "@/lib/constants"
import { get, set, del } from "idb-keyval"
import { useMemo, type ReactNode } from "react"

export const connectionIdRef = { current: null as string | null }

function createIDBPersister(
  idbValidKey: IDBValidKey = "mail-query-cache"
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
          query.queryKey
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

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => getQueryClient(), [])
  const persister = useMemo(() => createIDBPersister(), [])

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BURST_KEY,
        maxAge: 1000 * 60 * 60 * 24,
      }}
      onSuccess={() => {
        const threadQueryKey = ["threads"]
        queryClient.setQueriesData(
          { queryKey: threadQueryKey },
          (data: InfiniteData<unknown> | undefined) => {
            if (!data) return data
            return {
              pages: data.pages.slice(0, 3),
              pageParams: data.pageParams.slice(0, 3),
            }
          }
        )
        queryClient.invalidateQueries({ queryKey: threadQueryKey })
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
