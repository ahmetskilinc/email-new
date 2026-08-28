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

const QUERY_CACHE_KEY = "mail-query-cache"

/**
 * Drops the in-memory query cache and the IndexedDB copy of it. The persisted
 * cache holds message bodies and recipients, which otherwise survive sign-out
 * and are readable by the next person to use the browser profile.
 */
export async function clearPersistedQueryCache() {
  browserQueryClient?.clear()
  await del(QUERY_CACHE_KEY).catch(() => {})
}

/**
 * Who owns this browser's local caches, as stamped by the proxy: a plain
 * user-id cookie (deliberately not HttpOnly — it authorizes nothing). Read
 * synchronously so the ownership check can run inside the restore itself.
 */
function readCacheOwner(): string {
  if (typeof document === "undefined") return "anon"
  const match = document.cookie.match(/(?:^|;\s*)zm-uid=([^;]+)/)
  return match?.[1] ?? "anon"
}

type OwnedPersistedClient = {
  owner: string
  client: PersistedClient
}

function createIDBPersister(
  idbValidKey: IDBValidKey = QUERY_CACHE_KEY
): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, {
        owner: readCacheOwner(),
        client,
      } satisfies OwnedPersistedClient)
    },
    restoreClient: async () => {
      const stored = await get<OwnedPersistedClient | PersistedClient>(
        idbValidKey
      )
      if (!stored) return undefined
      // Legacy un-owned blobs (pre owner-tagging) are discarded outright.
      if (!("owner" in stored) || !("client" in stored)) {
        await del(idbValidKey).catch(() => {})
        return undefined
      }
      // A blob persisted under a different user must never rehydrate into
      // this session — this is the race-free half of user-switch protection
      // (the sign-out purge is the other half).
      if (stored.owner !== readCacheOwner()) {
        await del(idbValidKey).catch(() => {})
        return undefined
      }
      return stored.client
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
        // Trim restored infinite queries to their first pages so a long
        // scroll session doesn't rehydrate hundreds of pages. No invalidate:
        // restored data is older than staleTime, so mounting queries refetch
        // quietly in the background on their own — invalidating here forced
        // a visible refetch of exactly the data that was just restored.
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
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
