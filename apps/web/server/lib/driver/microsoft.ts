// @ts-nocheck
import {
  deleteActiveConnection,
  FatalErrors,
  fromBase64Url,
  sanitizeContext,
  StandardizedError,
} from "./utils"
import type {
  OutlookCategory as Category,
  MailFolder,
  Message,
  User,
} from "@microsoft/microsoft-graph-types"
import type { IOutgoingMessage, Label, ParsedMessage } from "../../types"
import { sanitizeTipTapHtml } from "../sanitize-tip-tap-html"
import { Client } from "@microsoft/microsoft-graph-client"
import type { MailManager, ManagerConfig } from "./types"
import type { CreateDraftData } from "../schemas"
import { env } from "../../env"
import he from "he"

// Graph mail folder ids are base64url blobs. Anything outside that alphabet in
// a caller-supplied folder is not an id, it's an attempt to steer the request
// path somewhere else in Graph on the user's token.
const GRAPH_FOLDER_ID = /^[A-Za-z0-9_=-]{1,512}$/

// Cap the page size, and the number of per-message Graph requests in flight
// for helpers that still fan out (conversation-id resolution, category reads),
// so a single request can't turn into hundreds of concurrent calls.
const MAX_LIST_RESULTS = 100
const LIST_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await fn(items[index]!, index)
      }
    }
  )
  await Promise.all(workers)
  return results
}

const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token"

export class OutlookMailManager implements MailManager {
  private graphClient: Client

  // Refreshed-token state. The config carries no expiry for the stored access
  // token, so the stored token is used until a request 401s; from then on the
  // in-memory token (with its known expiry) is the source of truth. Note the
  // refreshed token is only cached on this driver instance — the config does
  // not carry the connection id, so there is no way to persist it from here.
  private cachedToken: { token: string; expiresAt: number } | null = null
  private refreshPromise: Promise<string> | null = null
  private storedTokenInvalid = false

  constructor(public config: ManagerConfig) {
    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: () => this.getAccessToken(),
      },
    })
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt - 60_000 > Date.now()
    ) {
      return this.cachedToken.token
    }
    if (this.cachedToken) {
      // Cached token expired (or is about to) — refresh proactively.
      return this.refreshAccessToken()
    }
    if (!this.storedTokenInvalid && this.config.auth?.accessToken) {
      return this.config.auth.accessToken
    }
    return this.refreshAccessToken()
  }

  /** Single-flight refresh: concurrent callers share one token request. */
  private refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = (async () => {
      try {
        const refreshToken = this.config.auth?.refreshToken
        if (!refreshToken) {
          const error = new Error("No refresh token available for Microsoft")
          ;(error as any).code = "invalid_grant"
          throw error
        }

        const res = await fetch(MICROSOFT_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env.MICROSOFT_CLIENT_ID,
            client_secret: env.MICROSOFT_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: this.getScope(),
          }),
        })

        const data: any = await res.json().catch(() => ({}))
        if (!res.ok || !data.access_token) {
          const error = new Error(
            data.error_description ||
              `Microsoft token refresh failed (${res.status})`
          )
          ;(error as any).code = data.error || "token_refresh_failed"
          ;(error as any).statusCode = res.status
          throw error
        }

        this.cachedToken = {
          token: data.access_token,
          expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
        }
        return this.cachedToken.token
      } finally {
        this.refreshPromise = null
      }
    })()
    return this.refreshPromise
  }

  public getScope(): string {
    return [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/Calendars.Read",
      "offline_access",
    ].join(" ")
  }
  public getAttachment(messageId: string, attachmentId: string) {
    return this.withErrorHandler(
      "getAttachment",
      async () => {
        const response = await this.graphClient
          .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
          .get()

        const attachment = response

        if (!attachment || !attachment.contentBytes) {
          throw new Error("Attachment data not found")
        }

        const base64 = fromBase64Url(attachment.contentBytes)

        return base64
      },
      { messageId, attachmentId }
    )
  }
  public getMessageAttachments(messageId: string) {
    return this.withErrorHandler(
      "getMessageAttachments",
      async () => {
        const response = await this.graphClient
          .api(`/me/messages/${messageId}/attachments`)
          .get()

        const items: any[] = response?.value ?? []

        return items
          .filter(
            (att: any) =>
              att["@odata.type"] === "#microsoft.graph.fileAttachment"
          )
          .map((att: any) => ({
            filename: att.name || "",
            mimeType: att.contentType || "application/octet-stream",
            size: att.size || 0,
            attachmentId: att.id || "",
            headers: [] as { name: string; value: string }[],
            body: att.contentBytes || "",
          }))
      },
      { messageId }
    )
  }

  public getEmailAliases() {
    return this.withErrorHandler("getEmailAliases", async () => {
      const user: User = await this.graphClient
        .api("/me")
        .select("mail,userPrincipalName")
        .get()
      const primaryEmail = user.mail || user.userPrincipalName || ""

      const aliases: { email: string; name?: string; primary?: boolean }[] = [
        { email: primaryEmail, primary: true },
      ]

      return aliases
    })
  }
  public markAsRead(messageIds: string[]) {
    return this.withErrorHandler(
      "markAsRead",
      async () => {
        await this.modifyMessageReadStatus(messageIds, true)
      },
      { messageIds }
    )
  }
  public markAsUnread(messageIds: string[]) {
    return this.withErrorHandler(
      "markAsUnread",
      async () => {
        await this.modifyMessageReadStatus(messageIds, false)
      },
      { messageIds }
    )
  }
  private async modifyMessageReadStatus(threadIds: string[], isRead: boolean) {
    if (threadIds.length === 0) {
      return
    }

    // Callers pass thread ids (= Graph conversation ids); PATCHing
    // /me/messages/{id} needs message ids, so resolve members first.
    const messageIds = await this.resolveMessageIds(threadIds)

    const batchRequests = messageIds.map((id, index) => ({
      id: `${index}`,
      method: "PATCH",
      url: `/me/messages/${id}`,
      body: { isRead: isRead },
      headers: { "Content-Type": "application/json" },
    }))

    await this.executeBatch(batchRequests)
  }

  /**
   * Resolves ids that may be conversation ids into the member message ids by
   * filtering /me/messages on conversationId. Ids that match no conversation
   * are passed through unchanged (they are already message ids).
   */
  private async resolveMessageIds(ids: string[]): Promise<string[]> {
    const resolved = await mapWithConcurrency(
      ids,
      LIST_CONCURRENCY,
      async (id) => {
        try {
          const res = await this.graphClient
            .api("/me/messages")
            .filter(`conversationId eq '${id.replace(/'/g, "''")}'`)
            .select("id")
            .top(100)
            .get()
          const memberIds = (res?.value ?? [])
            .map((msg: { id?: string }) => msg.id)
            .filter((msgId: string | undefined): msgId is string => !!msgId)
          return memberIds.length > 0 ? memberIds : [id]
        } catch (err) {
          // Not resolvable as a conversation — treat as a message id. Log it:
          // if this was throttling rather than an id-space mismatch, the
          // fallthrough produces confusing 404s in the subsequent batch.
          console.warn(
            "[microsoft:resolveMessageIds] conversation filter failed, using raw id",
            err instanceof Error ? err.message : err
          )
          return [id]
        }
      }
    )
    return [...new Set(resolved.flat())]
  }

  /**
   * Posts requests through /$batch (20 parts per call, Graph's limit) and
   * inspects each part's status: throttled parts (429/503/504) are retried
   * honoring Retry-After, real failures are surfaced instead of being
   * silently swallowed by an HTTP 200 envelope.
   */
  private async executeBatch(requests: any[], maxRetries = 3) {
    let pending = requests
    for (let attempt = 0; pending.length > 0; attempt++) {
      const responses: any[] = []
      for (let i = 0; i < pending.length; i += 20) {
        const chunk = pending.slice(i, i + 20)
        const res = await this.graphClient
          .api("/$batch")
          .post({ requests: chunk })
        responses.push(...(res?.responses ?? []))
      }

      const byId = new Map(pending.map((req) => [String(req.id), req]))
      const retryable: any[] = []
      const failures: { id: string; status: number; body?: unknown }[] = []
      let retryAfterSeconds = 0

      for (const part of responses) {
        const status = Number(part?.status)
        if (status >= 200 && status < 300) continue
        const original = byId.get(String(part?.id))
        if (!original) continue
        if ([429, 503, 504].includes(status) && attempt < maxRetries) {
          const headerValue = Number(
            part?.headers?.["Retry-After"] ?? part?.headers?.["retry-after"]
          )
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Number.isFinite(headerValue) ? headerValue : 0
          )
          retryable.push(original)
        } else {
          failures.push({ id: String(part?.id), status, body: part?.body })
        }
      }

      if (failures.length > 0) {
        const first = failures[0]!
        throw new Error(
          `Graph $batch: ${failures.length} request(s) failed (first: status ${first.status})`
        )
      }

      pending = retryable
      if (pending.length > 0) {
        const delaySeconds = Math.min(
          Math.max(retryAfterSeconds, 2 ** attempt),
          30
        )
        await new Promise((resolve) =>
          setTimeout(resolve, delaySeconds * 1000)
        )
      }
    }
  }
  public getUserInfo() {
    return this.withErrorHandler(
      "getUserInfo",
      async () => {
        const user: User = await this.graphClient
          .api("/me")
          .select("id,displayName,userPrincipalName,mail")
          .get()

        let photoUrl = ""
        try {
          // Requires separate fetching logic
        } catch (error: unknown) {
          console.warn(
            "Could not fetch user photo:",
            error instanceof Error ? error.message : "Unknown error"
          )
        }

        const info = {
          address: user.mail || user.userPrincipalName || "",
          name: user.displayName || "",
          photo: photoUrl,
        }

        return info
      },
      {}
    )
  }
  public getTokens<T>(code: string) {
    return this.withErrorHandler(
      "getTokens",
      async () => {
        const tokens = {
          accessToken: this.config.auth?.accessToken,
          refreshToken: this.config.auth?.refreshToken,
        }
        return { tokens } as T
      },
      { code }
    )
  }
  public count() {
    return this.withErrorHandler(
      "count",
      async () => {
        // The folder listing already carries unreadItemCount/totalItemCount —
        // no per-folder GET needed. Page through @odata.nextLink so mailboxes
        // with more than one page of folders aren't truncated.
        const folders: { label: string; count: number | undefined }[] = []
        let request = this.graphClient
          .api("/me/mailFolders")
          .select("id,displayName,unreadItemCount,totalItemCount")
          .top(100)

        for (;;) {
          const res = await request.get()

          for (const folder of (res?.value ?? []) as MailFolder[]) {
            let normalizedLabel = folder.displayName || folder.id || ""

            if (folder.displayName === "Inbox") normalizedLabel = "Inbox"
            else if (folder.displayName === "Sent Items")
              normalizedLabel = "Sent"
            else if (folder.displayName === "Drafts") normalizedLabel = "Drafts"
            else if (folder.displayName === "Deleted Items")
              normalizedLabel = "Bin"
            else if (folder.displayName === "Archive")
              normalizedLabel = "Archive"
            else if (folder.displayName === "Junk Email")
              normalizedLabel = "Spam"

            // Use unreadItemCount only for Inbox, use totalItemCount for all other folders
            const count =
              normalizedLabel === "Inbox"
                ? Number(folder.unreadItemCount)
                : Number(folder.totalItemCount)

            folders.push({
              label: normalizedLabel,
              count: Number.isFinite(count) ? count : undefined,
            })
          }

          const nextLink: string | undefined = res?.["@odata.nextLink"]
          if (!nextLink) break
          request = this.graphClient.api(nextLink)
        }

        return folders
      },
      { email: this.config.auth?.email }
    )
  }
  public list(params: {
    folder: string
    query?: string
    maxResults?: number
    labelIds?: string[]
    pageToken?: string
  }) {
    const { folder, query: q, pageToken } = params
    const maxResults = Math.min(params.maxResults ?? 100, MAX_LIST_RESULTS)

    let request
    if (pageToken) {
      // pageToken is Graph's @odata.nextLink: a full URL that already carries
      // the folder, $select, $top and skip state — request it as-is.
      request = this.graphClient.api(pageToken)
    } else {
      const folderId = this.resolveFolderId(folder)

      request = this.graphClient
        .api(`/me/mailFolders/${encodeURIComponent(folderId)}/messages`)
        .top(maxResults)
        .select(
          "id,subject,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,isRead,internetMessageId,inferenceClassification,categories,parentFolderId,conversationId,bodyPreview,hasAttachments,internetMessageHeaders"
        )

      if (q) {
        // $search values are wrapped in double quotes; embedded quotes would
        // break out of the phrase, so strip them.
        request = request.search(`"${q.replace(/"/g, "")}"`)
      } else {
        // $orderby cannot be combined with $search.
        request = request.orderby("receivedDateTime desc")
      }
    }

    return this.withErrorHandler(
      "list",
      async () => {
        const res = await request.get()

        const messages: Message[] = res.value ?? []
        const nextPageLink: string | undefined = res["@odata.nextLink"]

        // The $select projection (bodyPreview, hasAttachments, …) already
        // carries everything a list row needs — no per-message get() here.
        // Bodies and attachment content are fetched on demand via get() /
        // getAttachment().
        const parsedMessages = messages.map((msg) =>
          this.parseOutlookMessage(msg)
        )

        return {
          threads: messages.map((msg, index) => ({
            id: msg.id || msg.internetMessageId || "",
            historyId: msg.lastModifiedDateTime ?? null,
            $raw: {
              ...msg,
              ...parsedMessages[index],
            },
          })),
          nextPageToken: nextPageLink || null,
        }
      },
      {
        folder,
        q,
        maxResults,
        _labelIds: params.labelIds,
        pageToken,
        email: this.config.auth?.email,
      }
    )
  }
  private getOutlookFolderId(folderName: string): string | undefined {
    switch (folderName.toLowerCase()) {
      case "inbox":
        return "inbox"
      case "sent":
        return "sentitems"
      case "drafts":
        return "drafts"
      case "bin":
      case "trash":
        return "deleteditems"
      case "archive":
        return "archive"
      case "junk":
      case "spam":
        return "junkemail"
      default:
        return undefined
    }
  }
  /**
   * Maps a caller-supplied folder onto a Graph folder id. Unknown names used
   * to fall through verbatim into the request path, which let a caller reach
   * arbitrary Graph endpoints under the user's own scopes; now anything that
   * isn't a well-known folder has to at least look like a Graph id.
   */
  private resolveFolderId(folder: string): string {
    const wellKnown = this.getOutlookFolderId(folder)
    if (wellKnown) return wellKnown
    if (!GRAPH_FOLDER_ID.test(folder)) {
      throw new Error(`Invalid folder: ${folder}`)
    }
    return folder
  }
  public get(id: string) {
    return this.withErrorHandler(
      "get",
      async () => {
        const message: Message = await this.graphClient
          .api(`/me/messages/${id}`)
          .select(
            "id,subject,body,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,isRead,internetMessageId,inferenceClassification,categories,conversationId,bodyPreview,internetMessageHeaders"
          )
          // Metadata only — contentBytes stays out of this request and is
          // fetched on demand through getAttachment().
          .expand("attachments($select=id,name,size,contentType,isInline)")
          .get()

        if (!message) {
          throw new Error("Message not found")
        }

        const bodyContent = message.body?.content || ""
        const bodyContentType =
          message.body?.contentType?.toLowerCase() || "text"

        let decodedBody = ""
        if (bodyContentType === "html") {
          decodedBody = he.decode(bodyContent)
        } else {
          decodedBody = he.decode(bodyContent).replace(/\n/g, "<br>")
        }

        const attachmentsData = message.attachments || []

        const attachments = attachmentsData
          .filter((att) => att.id && att.name)
          .map((att) => ({
            filename: att.name || "",
            mimeType: att.contentType ?? "application/octet-stream",
            size: att.size ?? 0,
            attachmentId: att.id || "",
            headers: [] as { name: string; value: string }[],
            body: "", // Empty body — fetch on demand with getAttachment
          }))

        const parsedData = this.parseOutlookMessage(message)

        const fullEmailData = {
          ...parsedData,
          body: "",
          processedHtml: "",
          blobUrl: "",
          decodedBody: decodedBody,
          attachments,
        }

        return {
          labels: parsedData.tags,
          messages: [fullEmailData],
          latest: fullEmailData,
          hasUnread: parsedData.unread,
          totalReplies: 1,
        }
      },
      { id, email: this.config.auth?.email }
    )
  }
  public create(data: IOutgoingMessage) {
    return this.withErrorHandler(
      "create",
      async () => {
        const messagePayload = await this.parseOutgoingOutlook(data)

        const res = await this.graphClient.api("/me/sendMail").post({
          message: messagePayload,
          saveToSentItems: true,
        })

        return res
      },
      { data, email: this.config.auth?.email }
    )
  }
  public delete(id: string) {
    return this.withErrorHandler(
      "delete",
      async () => {
        await this.graphClient.api(`/me/messages/${id}`).delete()
      },
      { id }
    )
  }
  public normalizeIds(ids: string[]) {
    return this.withSyncErrorHandler(
      "normalizeIds",
      () => {
        const messageIds: string[] = ids.map((id) =>
          id.startsWith("thread:") ? id.substring(7) : id
        )
        return { threadIds: messageIds } // Renamed from threadIds to messageIds conceptually
      },
      { ids }
    )
  }
  public modifyLabels(
    messageIds: string[],
    options: { addLabels: string[]; removeLabels: string[] }
  ) {
    return this.withErrorHandler(
      "modifyLabels",
      async () => {
        await this.modifyMessageLabelsOrFolders(
          messageIds,
          options.addLabels,
          options.removeLabels
        )
      },
      { messageIds, options }
    )
  }
  private async modifyMessageLabelsOrFolders(
    threadIds: string[],
    addItems: string[],
    removeItems: string[]
  ) {
    if (threadIds.length === 0) {
      return
    }

    // Split the requested changes into a folder move (a well-known folder in
    // addItems) and category add/removes (everything else).
    const moveToFolderId = addItems
      .map((item) => this.getOutlookFolderId(item))
      .find((folderId) => folderId !== undefined)
    const addCategories = addItems.filter(
      (item) => !this.getOutlookFolderId(item)
    )
    const removeCategories = removeItems.filter(
      (item) => !this.getOutlookFolderId(item)
    )

    // Removing a well-known folder with no destination (bulkArchive sends
    // removeLabels:["INBOX"]) is a move, not a category change — Graph has no
    // "remove from folder" concept. Mirror the IMAP transport: archive it.
    const removesFolder = removeItems.some((item) =>
      this.getOutlookFolderId(item)
    )
    const effectiveMoveId =
      moveToFolderId ?? (removesFolder ? "archive" : undefined)

    if (
      !effectiveMoveId &&
      addCategories.length === 0 &&
      removeCategories.length === 0
    ) {
      return
    }

    // Callers pass thread ids (= Graph conversation ids); resolve them to the
    // member message ids that /me/messages operations require.
    const messageIds = await this.resolveMessageIds(threadIds)
    if (messageIds.length === 0) return

    if (addCategories.length > 0 || removeCategories.length > 0) {
      // PATCHing `categories` replaces the whole array, so read each
      // message's current categories first, then write the merged set.
      const current = await mapWithConcurrency(
        messageIds,
        LIST_CONCURRENCY,
        async (id) => {
          const res = await this.graphClient
            .api(`/me/messages/${id}`)
            .select("id,categories")
            .get()
          return { id, categories: (res?.categories ?? []) as string[] }
        }
      )

      const patchRequests = current.map(({ id, categories }, index) => {
        const next = new Set(categories)
        removeCategories.forEach((cat) => next.delete(cat))
        addCategories.forEach((cat) => next.add(cat))
        return {
          id: `${index}`,
          method: "PATCH",
          url: `/me/messages/${id}`,
          body: { categories: [...next] },
          headers: { "Content-Type": "application/json" },
        }
      })

      await this.executeBatch(patchRequests)
    }

    if (effectiveMoveId) {
      const moveRequests = messageIds.map((id, index) => ({
        id: `${index}`,
        method: "POST",
        url: `/me/messages/${id}/move`,
        body: { destinationId: effectiveMoveId },
        headers: { "Content-Type": "application/json" },
      }))

      await this.executeBatch(moveRequests)
    }
  }
  public sendDraft(draftId: string, data: IOutgoingMessage) {
    return this.withErrorHandler(
      "sendDraft",
      async () => {
        await this.graphClient.api(`/me/messages/${draftId}/send`).post({})
      },
      { draftId, data }
    )
  }
  public getDraft(draftId: string) {
    return this.withErrorHandler(
      "getDraft",
      async () => {
        const draftMessage: Message = await this.graphClient
          .api(`/me/messages/${draftId}`) // Drafts are messages in the drafts folder
          .select(
            "id,subject,body,from,toRecipients,ccRecipients,bccRecipients"
          )
          .get()

        if (!draftMessage) {
          throw new Error("Draft not found")
        }

        const parsedDraft = this.parseOutlookDraft(draftMessage)
        if (!parsedDraft) {
          throw new Error("Failed to parse draft")
        }

        return parsedDraft
      },
      { draftId }
    )
  }
  public deleteDraft(draftId: string) {
    return this.withErrorHandler(
      "deleteDraft",
      async () => {
        await this.graphClient.api(`/me/messages/${draftId}`).delete()
      },
      { draftId }
    )
  }
  public listDrafts(params: {
    q?: string
    maxResults?: number
    pageToken?: string
  }) {
    const { q, maxResults = 20, pageToken } = params
    return this.withErrorHandler(
      "listDrafts",
      async () => {
        let request
        if (pageToken) {
          // pageToken is Graph's @odata.nextLink — a full URL carrying all
          // the query state for the next page.
          request = this.graphClient.api(pageToken)
        } else {
          request = this.graphClient
            .api("/me/mailfolders/drafts/messages")
            .select(
              "id,subject,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,isRead,internetMessageId,conversationId,bodyPreview,internetMessageHeaders"
            )
            .top(maxResults)

          if (q) {
            request = request.search(`"${q.replace(/"/g, "")}"`)
          } else {
            request = request.orderby("receivedDateTime desc")
          }
        }

        const res = await request.get()

        const draftMessages: Message[] = res.value
        const nextPageLink: string | undefined = res["@odata.nextLink"]

        const drafts = await Promise.all(
          draftMessages.map(async (message) => {
            if (!message.id) return null
            try {
              const parsed = this.parseOutlookMessage(message)
              return {
                ...parsed,
                id: message.id,
                threadId: message.conversationId || message.id,
                receivedOn:
                  message.receivedDateTime || new Date().toISOString(),
              }
            } catch (error) {
              console.error("Error parsing draft message:", error)
              return null
            }
          })
        )

        const sortedDrafts = drafts
          .filter((draft) => draft !== null)
          .sort((a, b) => {
            const dateA = new Date(a?.receivedOn || new Date()).getTime()
            const dateB = new Date(b?.receivedOn || new Date()).getTime()
            return dateB - dateA
          })

        return {
          threads: sortedDrafts.map((draft) => ({
            id: draft.id,
            historyId: null,
            $raw: draft,
          })),
          nextPageToken: nextPageLink || null,
        }
      },
      { q, maxResults, pageToken }
    )
  }
  public createDraft(data: CreateDraftData) {
    return this.withErrorHandler(
      "createDraft",
      async () => {
        const { html: message, inlineImages } = await sanitizeTipTapHtml(
          data.message
        )

        const toRecipients = Array.isArray(data.to)
          ? data.to
          : data.to.split(", ")

        const outlookMessage: Message = {
          subject: data.subject,
          body: {
            contentType: "html",
            content: message || "",
          },
          toRecipients: toRecipients.map((recipient) => ({
            emailAddress: {
              address:
                typeof recipient === "string" ? recipient : recipient.email,
              name:
                typeof recipient === "string"
                  ? undefined
                  : recipient.name || undefined,
            },
          })),
        }

        if (data.cc) {
          const ccRecipients = Array.isArray(data.cc)
            ? data.cc
            : data.cc.split(", ")
          outlookMessage.ccRecipients = ccRecipients.map((recipient) => ({
            emailAddress: {
              address:
                typeof recipient === "string" ? recipient : recipient.email,
              name:
                typeof recipient === "string"
                  ? undefined
                  : recipient.name || undefined,
            },
          }))
        }

        if (data.bcc) {
          const bccRecipients = Array.isArray(data.bcc)
            ? data.bcc
            : data.bcc.split(", ")
          outlookMessage.bccRecipients = bccRecipients.map((recipient) => ({
            emailAddress: {
              address:
                typeof recipient === "string" ? recipient : recipient.email,
              name:
                typeof recipient === "string"
                  ? undefined
                  : recipient.name || undefined,
            },
          }))
        }

        const allAttachments = []

        if (inlineImages.length > 0) {
          for (const image of inlineImages) {
            allAttachments.push({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: image.cid,
              contentType: image.mimeType,
              contentBytes: image.data,
              contentId: image.cid,
              isInline: true,
            })
          }
        }

        if (data.attachments && data.attachments.length > 0) {
          const regularAttachments = await Promise.all(
            data.attachments.map(async (file) => {
              const arrayBuffer = await file.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              const base64Content = buffer.toString("base64")

              return {
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: file.name,
                contentType: file.type || "application/octet-stream",
                contentBytes: base64Content,
              }
            })
          )
          allAttachments.push(...regularAttachments)
        }

        if (allAttachments.length > 0) {
          outlookMessage.attachments = allAttachments
        }

        let res

        if (data.id) {
          try {
            res = await this.graphClient
              .api(`/me/mailfolders/drafts/messages/${data.id}`)
              .patch(outlookMessage)
          } catch (error) {
            console.warn(
              `Failed to update draft ${data.id}, creating a new one`,
              error
            )
            try {
              await this.graphClient
                .api(`/me/mailfolders/drafts/messages/${data.id}`)
                .delete()
            } catch (deleteError) {
              console.error(`Failed to delete draft ${data.id}`, deleteError)
            }

            res = await this.graphClient
              .api("/me/mailfolders/drafts/messages")
              .post(outlookMessage)
          }
        } else {
          res = await this.graphClient
            .api("/me/mailfolders/drafts/messages")
            .post(outlookMessage)
        }

        return res
      },
      { data }
    )
  }
  public async getUserLabels() {
    try {
      // Get root mail folders with their immediate children in one request,
      // so the common one-level hierarchy needs no per-folder round trips.
      const rootFoldersResponse = await this.graphClient
        .api("/me/mailfolders")
        .top(100)
        .expand("childFolders($top=100)")
        .get()
      const rootFolders: MailFolder[] = rootFoldersResponse.value || []

      // System folders to identify
      const systemFolderNames = [
        "inbox",
        "drafts",
        "sentitems",
        "deleteditems",
        "archive",
        "outbox",
        "junkemail",
        "clutter",
        "notes",
        "journal",
        "calendar",
        "contacts",
        "tasks",
        "conversationhistory",
      ]

      const processedFolders = await this.processMailFoldersHierarchy(
        rootFolders,
        systemFolderNames
      )

      // No log of the folder tree here — it is a map of the user's mailbox.
      return processedFolders
    } catch (error) {
      console.error("Error fetching Outlook categories or folders:", error)
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack)
      }
      return []
    }
  }
  private async processMailFoldersHierarchy(
    folders: MailFolder[],
    systemFolderNames: string[],
    depth: number = 0,
    maxDepth: number = 99
  ): Promise<Label[]> {
    if (depth >= maxDepth) {
      return []
    }

    const result: Label[] = []

    for (const folder of folders) {
      if (!folder.id) continue

      try {
        const folderType = systemFolderNames.includes(
          folder.displayName?.toLowerCase() || ""
        )
          ? "system"
          : "user"

        // Prefer children already delivered via $expand; only fall back to a
        // per-folder request when the folder has children we don't have yet.
        let childFolders: MailFolder[] = folder.childFolders || []
        if (
          childFolders.length === 0 &&
          (folder.childFolderCount ?? 0) > 0
        ) {
          const childFoldersResponse = await this.graphClient
            .api(`/me/mailFolders/${folder.id}/childFolders`)
            .top(100)
            .expand("childFolders($top=100)")
            .get()
          childFolders = childFoldersResponse.value || []
        }

        const childLabels = await this.processMailFoldersHierarchy(
          childFolders,
          systemFolderNames,
          depth + 1,
          maxDepth
        )

        const label: Label = {
          id: folder.id,
          name: folder.displayName || "",
          type: folderType,
          color: {
            backgroundColor: "",
            textColor: "",
          },
        }

        if (childLabels.length > 0) {
          label.labels = childLabels
        }

        result.push(label)
      } catch (error) {
        console.error(
          `Error processing folder ${folder.displayName || folder.id}:`,
          error
        )
      }
    }

    return result
  }
  public async getLabel(labelId: string): Promise<Label> {
    console.warn(
      "getLabel needs to differentiate between Category ID and Mail Folder ID."
    )

    try {
      const folder: MailFolder = await this.graphClient
        .api(`/me/mailfolders/${labelId}`)
        .get()
      return {
        id: folder.id || "",
        name: folder.displayName || "",
        type: "user",
        color: { backgroundColor: "", textColor: "" },
      }
    } catch (folderError) {
      try {
        const category: Category = await this.graphClient
          .api(`/me/outlook/masterCategories/${labelId}`)
          .get()
        return {
          id: category.id || category.displayName || "",
          name: category.displayName || "",
          type: "category",
          color: { backgroundColor: category.color || "", textColor: "" },
        }
      } catch (categoryError) {
        console.error(
          `Label or folder with id ${labelId} not found as Folder or Category:`,
          folderError,
          categoryError
        )
        throw new Error(`Label or folder with id ${labelId} not found`)
      }
    }
  }
  public async createLabel(label: {
    name: string
    color?: { backgroundColor: string; textColor: string }
  }) {
    console.warn(
      "createLabel defaults to creating a Mail Folder. Creating a Category uses a different API."
    )

    try {
      await this.graphClient.api("/me/mailfolders").post({
        displayName: label.name,
        // parentFolderId: 'inbox', // Optional: Create under a specific parent folder
      })

      // create a Category:
      // const newCategory: Category = await this.graphClient.api('/me/outlook/masterCategories').post({
      //     displayName: label.name,
      //      color: 'presetColorEnum' // Graph category color is a string enum
      // });
      // console.log('Category created:', newCategory);
    } catch (error) {
      console.error("Error creating Outlook Mail Folder:", error)
      throw error
    }
  }
  public async updateLabel(id: string, label: Label) {
    console.warn(
      "updateLabel needs to differentiate between Category and Mail Folder updates."
    )

    try {
      await this.graphClient.api(`/me/mailfolders/${id}`).patch({
        displayName: label.name,
        // Folder colors are not updateable via Graph API
      })
      console.log(`Mail Folder ${id} updated.`)
    } catch (folderError) {
      try {
        await this.graphClient.api(`/me/outlook/masterCategories/${id}`).patch({
          displayName: label.name,
          // color: label.color?.backgroundColor, // Requires mapping hex to Graph color enum
        })
        console.log(`Category ${id} updated.`)
      } catch (categoryError) {
        console.error(
          `Could not update label or folder with id ${id} as Folder or Category:`,
          folderError,
          categoryError
        )
        throw new Error(`Could not update label or folder with id ${id}`)
      }
    }
  }
  public async deleteLabel(id: string) {
    await this.graphClient.api(`/me/mailfolders/${id}`).delete()
  }
  public async revokeToken(token: string) {
    if (!token) return false

    try {
      console.warn(
        "Revoking Microsoft refresh tokens requires MSAL or specific Azure AD endpoints, not a direct Graph API call. This method is a placeholder."
      )
      return false
    } catch (error: unknown) {
      console.error(
        "Failed to revoke Microsoft token:",
        error instanceof Error ? error.message : "Unknown error"
      )
      return false
    }
  }

  public deleteAllSpam() {
    console.warn("deleteAllSpam is not implemented for Microsoft")
    return Promise.resolve({
      success: false,
      message: "Not implemented",
      count: 0,
    })
  }

  private normalizeSearch(folder: string, q: string) {
    // This normalization logic is based on Gmail's search syntax and folder mapping.
    // For Outlook/Graph, you need to translate to OData $filter or $search syntax
    // and map folder names to Outlook folder IDs.
    console.warn(
      "normalizeSearch is based on Gmail syntax. Needs translation to OData $filter or $search."
    )

    let outlookQuery = q
    let folderId: string | undefined

    switch (folder.toLowerCase()) {
      case "inbox":
        folderId = "inbox"
        break
      case "bin":
      case "trash":
        folderId = "deleteditems"
        break
      case "archive":
        folderId = "archive"
        break
      case "sent":
        folderId = "sentitems"
        break
      case "drafts":
        folderId = "drafts"
        break
      default:
        folderId = folder
        break
    }

    // This is a very basic translation. A real implementation needs to parse Gmail queries
    // and build complex OData filter strings.
    if (q) {
      // Simple keyword search example
      outlookQuery = `"${q}"`
    }

    return { folder: folderId, q: outlookQuery }
  }
  private parseOutlookMessage({
    id,
    conversationId,
    subject,
    bodyPreview,
    isRead,
    from,
    toRecipients,
    ccRecipients,
    bccRecipients,
    receivedDateTime,
    internetMessageId,
    categories,
    internetMessageHeaders,
  }: Message): Omit<
    ParsedMessage,
    "body" | "processedHtml" | "blobUrl" | "totalReplies" | "attachments"
  > {
    const receivedOn = receivedDateTime || new Date().toISOString()
    const sender = from?.emailAddress
      ? {
          name: from.emailAddress.name || "",
          email: from.emailAddress.address || "",
        }
      : { name: "Unknown", email: "unknown@example.com" }

    const to =
      toRecipients?.map((rec) => ({
        name: rec.emailAddress?.name || "",
        email: rec.emailAddress?.address || "",
      })) || []

    const cc =
      ccRecipients?.map((rec) => ({
        name: rec.emailAddress?.name || "",
        email: rec.emailAddress?.address || "",
      })) || null

    const bcc =
      bccRecipients?.map((rec) => ({
        name: rec.emailAddress?.name || "",
        email: rec.emailAddress?.address || "",
      })) || []

    const tags: Label[] =
      (categories || []).map((cat) => ({
        id: cat,
        name: cat,
        type: "category",
        color: {
          backgroundColor: "",
          textColor: "",
        },
      })) || []

    let references: string | undefined = undefined
    let inReplyTo: string | undefined = undefined
    let listUnsubscribe: string | undefined = undefined
    let listUnsubscribePost: string | undefined = undefined
    let replyTo: string | undefined = undefined

    if (internetMessageHeaders?.length) {
      const byName = (n: string) =>
        internetMessageHeaders.find((h) => h.name?.toLowerCase() === n)
          ?.value || undefined

      references = byName("references")
      inReplyTo = byName("in-reply-to")
      listUnsubscribe = byName("list-unsubscribe")
      listUnsubscribePost = byName("list-unsubscribe-post")
      replyTo = byName("reply-to")
    }

    // TLS status is difficult to determine reliably from typical Graph message properties.
    // You'd need to examine "Received" headers if available and parse them, similar to the Gmail logic.
    // The `wasSentWithTLS` utility would need to be adapted or rewritten for Outlook header formats.
    const tls = false // Placeholder - needs proper header parsing

    return {
      id: id || "ERROR",
      bcc,
      threadId: conversationId || id || "",
      title: bodyPreview ? he.decode(bodyPreview).trim() : "ERROR",
      tls: tls,
      tags: tags,
      listUnsubscribe,
      listUnsubscribePost,
      replyTo,
      references,
      inReplyTo,
      sender,
      unread: !isRead,
      to,
      cc,
      receivedOn: receivedOn.toString(),
      subject: subject ? he.decode(subject).trim() : "(no subject)",
      messageId: internetMessageId || id || "ERROR",
    }
  }
  private async parseOutgoingOutlook({
    to,
    subject,
    message,
    attachments,
    headers,
    cc,
    bcc,
  }: IOutgoingMessage): Promise<Message> {
    // Outlook Graph API expects a Message object structure for sending/creating drafts
    // (the recipient list used to be logged here — every send dumped the full
    // To: line into stdout, where it outlives the request in log storage)
    const { html: processedMessage, inlineImages } = await sanitizeTipTapHtml(
      message.trim()
    )
    const outlookMessage: Message = {
      subject: subject,
      body: {
        contentType: "html", // Or 'text'
        content: processedMessage,
      },
      toRecipients:
        to?.map((rec) => ({
          emailAddress: {
            name: rec.name || "",
            address: rec.email,
          },
        })) || [],
      ccRecipients:
        cc?.map((rec) => ({
          emailAddress: {
            name: rec.name || "",
            address: rec.email,
          },
        })) || undefined,
      bccRecipients:
        bcc?.map((rec) => ({
          emailAddress: {
            name: rec.name || "",
            address: rec.email,
          },
        })) || undefined,
      // from, sender properties are often handled automatically by Graph based on auth
      // or require specific permissions (Send as, Send on behalf of) and different payload structure.
      // If fromEmail is provided and requires Send As/On Behalf permissions:
      // from: { emailAddress: { name: 'Sender Name', address: fromEmail } } // Requires permission
    }

    if (headers) {
      outlookMessage.internetMessageHeaders = Object.entries(headers)
        .filter(([, v]) => !!v)
        .map(([name, value]) => ({ name, value: value.toString() }))
    }

    // Handle inline images and attachments
    const allAttachments = []

    if (inlineImages.length > 0) {
      for (const image of inlineImages) {
        allAttachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: image.cid,
          contentType: image.mimeType,
          contentBytes: image.data,
          contentId: image.cid,
          isInline: true,
        })
      }
    }

    if (attachments?.length > 0) {
      const regularAttachments = await Promise.all(
        attachments.map(async (file) => {
          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const base64Content = buffer.toString("base64")

          return {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: file.name,
            contentType: file.type || "application/octet-stream",
            contentBytes: base64Content,
          }
        })
      )
      allAttachments.push(...regularAttachments)
    }

    if (allAttachments.length > 0) {
      outlookMessage.attachments = allAttachments
    }

    return outlookMessage
  }
  private parseOutlookDraft(draftMessage: Message) {
    if (!draftMessage) return null

    const to =
      draftMessage.toRecipients
        ?.map((rec) => rec.emailAddress?.address || "")
        .filter(Boolean) || []
    const subject = draftMessage.subject

    let content = ""
    if (draftMessage.body?.content) {
      content = draftMessage.body.content
      if (draftMessage.body.contentType?.toLowerCase() === "text") {
        content = content.replace(/\n/g, "<br>") // Basic text to HTML
      }
    }

    const cc =
      draftMessage.ccRecipients
        ?.map((rec) => rec.emailAddress?.address || "")
        .filter(Boolean) || []
    const bcc =
      draftMessage.bccRecipients
        ?.map((rec) => rec.emailAddress?.address || "")
        .filter(Boolean) || []

    return {
      id: draftMessage.id || "",
      to,
      cc,
      bcc,
      subject: subject ? he.decode(subject).trim() : "",
      content,
      rawMessage: draftMessage, // Include raw Graph message
    }
  }
  private async withErrorHandler<T>(
    operation: string,
    fn: () => Promise<T> | T,
    context?: Record<string, unknown>
  ): Promise<T> {
    try {
      return await Promise.resolve(fn())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (initialError: any) {
      let error = initialError
      // A 401 usually just means the stored access token expired. Refresh and
      // retry once before considering the credential dead.
      if (initialError?.statusCode === 401) {
        this.storedTokenInvalid = true
        this.cachedToken = null
        try {
          await this.refreshAccessToken()
          return await Promise.resolve(fn())
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (retryError: any) {
          error = retryError
        }
      }
      // "Fatal" here means the connection gets torn down, so it must mean the
      // credential is actually dead — a 401 or invalid_grant. Treating every
      // 4xx that way let a bad message id or a permissions blip take out the
      // user's whole connection.
      const isFatal =
        FatalErrors.includes(error.message) ||
        FatalErrors.includes(error.code) ||
        error.statusCode === 401
      console.error(
        `[${isFatal ? "FATAL_ERROR" : "ERROR"}] [Outlook Driver] Operation: ${operation}`,
        {
          error: error.message,
          code: error.code, // Graph errors might have error.code
          statusCode: error.statusCode, // Graph errors have status codes
          context: sanitizeContext(context),
          stack: error.stack,
          isFatal,
        }
      )
      if (isFatal)
        await deleteActiveConnection(
          this.config.auth?.userId,
          this.config.auth?.email
        )
      throw new StandardizedError(error, operation, context)
    }
  }
  private withSyncErrorHandler<T>(
    operation: string,
    fn: () => T,
    context?: Record<string, unknown>
  ): T {
    try {
      return fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Same narrowing as withErrorHandler: only a dead credential is fatal.
      const isFatal =
        FatalErrors.includes(error.message) ||
        FatalErrors.includes(error.code) ||
        error.statusCode === 401
      console.error(`[Outlook Driver Error] Operation: ${operation}`, {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        context: sanitizeContext(context),
        stack: error.stack,
        isFatal,
      })
      if (isFatal)
        void deleteActiveConnection(
          this.config.auth?.userId,
          this.config.auth?.email
        )
      throw new StandardizedError(error, operation, context)
    }
  }
  listHistory<T>(
    historyId: string
  ): Promise<{ history: T[]; historyId: string }> {
    return Promise.resolve({ history: [], historyId })
  }
}
