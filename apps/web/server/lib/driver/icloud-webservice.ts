import type {
  DeleteAllSpamResponse,
  IOutgoingMessage,
  Label,
  ParsedMessage,
} from "../../types"
import type {
  IGetThreadResponse,
  MailManager,
  ManagerConfig,
  ParsedDraft,
} from "./types"
import type { CreateDraftData } from "../schemas"
import { ICloudWebServiceClient } from "../transport/icloud/client"
import {
  ICloudReauthRequiredError,
  ICloudUnsupportedOperationError,
  ICloudProtocolError,
} from "../transport/icloud/errors"
import {
  folderToLabel,
  resolveFolder,
  toParsedMessage,
  toThreadRows,
} from "../transport/icloud/mapper"
import {
  createFolder,
  deleteFolder,
  deleteMessages,
  emptyFolder,
  getAttachment,
  getMessage,
  getRawMessage,
  listConversation,
  listFolders,
  listMessages,
  moveMessages,
  renameFolder,
  setFlags,
} from "../transport/icloud/operations"
import type {
  ICloudFolder,
  ICloudMessageDetail,
  ICloudMessageSummary,
} from "../transport/icloud/types"
import { DEFAULT_PAGE_SIZE } from "../transport/icloud/constants"

const ICLOUD_WEBSERVICE_SCOPE = "icloud.mailws"

/** Ceiling on how many messages of one thread get their bodies fetched. */
const MAX_THREAD_MESSAGES = 25

/**
 * iCloud Mail provider backed by Apple's `mailws` web service — the same HTTP
 * backend iCloud.com's Mail frontend uses, rather than IMAP.
 *
 * It authenticates with a captured iCloud.com session instead of an
 * app-specific password, which is why every call funnels through
 * `ICloudWebServiceClient`: that class owns the credential, its rotation, and
 * the single point where an Apple auth failure becomes a re-auth signal.
 *
 * This is a reverse-engineered, unsupported API. Two consequences are visible
 * in the code: operations Apple's captured protocol does not cover throw
 * `ICloudUnsupportedOperationError` (the router driver then falls back to
 * IMAP/SMTP), and every reauth failure marks the connection so the user gets
 * asked to reconnect rather than seeing an empty mailbox.
 */
export class ICloudWebServiceMailManager implements MailManager {
  private readonly client: ICloudWebServiceClient
  private folderCache: Promise<ICloudFolder[]> | null = null

  constructor(public config: ManagerConfig) {
    const session = config.icloud?.session
    if (!session) {
      throw new Error(
        "iCloud web service driver requires a captured iCloud session"
      )
    }
    this.client = new ICloudWebServiceClient({
      session,
      onSessionUpdate: config.icloud?.onSessionUpdate,
    })
  }

  public getScope(): string {
    return ICLOUD_WEBSERVICE_SCOPE
  }

  /* --------------------------- infrastructure --------------------------- */

  /**
   * Runs an operation, converting Apple's auth failures into a recorded
   * connection state before rethrowing.
   *
   * Recording has to happen here rather than at the call sites: a session can
   * expire on any request, and a mailbox that silently returns nothing is far
   * worse than one that says "reconnect iCloud".
   */
  private async guard<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof ICloudReauthRequiredError) {
        await this.recordState("reauth_required", operation, error)
      } else if (error instanceof ICloudProtocolError) {
        await this.recordState("unsupported", operation, error)
      }
      throw error
    }
  }

  private async recordState(
    state: "reauth_required" | "unsupported",
    operation: string,
    error: Error
  ) {
    console.error(
      `[icloud:mailws] ${operation} -> ${state}`,
      this.client.describe(),
      error.message
    )
    try {
      await this.config.icloud?.onStateChange?.(state)
    } catch (persistError) {
      console.error(
        "[icloud:mailws] failed to record connection state",
        persistError instanceof Error ? persistError.message : persistError
      )
    }
  }

  private folders(): Promise<ICloudFolder[]> {
    // Cached per driver instance, not across requests: folder membership is
    // cheap to refetch and a stale GUID would silently move mail to the wrong
    // place.
    if (!this.folderCache) {
      this.folderCache = listFolders(this.client).catch((error) => {
        this.folderCache = null
        throw error
      })
    }
    return this.folderCache
  }

  private async folderByRole(
    role: NonNullable<ICloudFolder["role"]>
  ): Promise<ICloudFolder | undefined> {
    return (await this.folders()).find((folder) => folder.role === role)
  }

  private async requireFolder(requested: string): Promise<ICloudFolder> {
    const folders = await this.folders()
    const folder = resolveFolder(folders, requested)
    if (!folder) throw new Error(`Unknown iCloud folder: ${requested}`)
    return folder
  }

  /**
   * Message GUIDs belonging to a thread.
   *
   * Falls back to treating the thread id as a message GUID, which is exactly
   * the right behaviour when Apple returns no conversation id for an account —
   * `threadIdFor` uses the message GUID in that case.
   */
  private async threadGuids(threadId: string): Promise<string[]> {
    const conversation = await listConversation(this.client, threadId).catch(
      () => [] as ICloudMessageSummary[]
    )
    if (conversation.length === 0) return [threadId]
    return conversation.map((message) => message.guid)
  }

  private async folderForMessage(
    message: ICloudMessageSummary
  ): Promise<ICloudFolder | undefined> {
    if (!message.folderGuid) return undefined
    return (await this.folders()).find(
      (folder) => folder.guid === message.folderGuid
    )
  }

  /* ------------------------------- account ------------------------------- */

  public async getUserInfo() {
    return this.guard("getUserInfo", async () => {
      const bootstrap = await this.client.bootstrap()
      const address = bootstrap.primaryEmail || this.config.auth.email
      return {
        address,
        name: bootstrap.fullName || address.split("@")[0] || address,
        photo: "",
      }
    })
  }

  public async getTokens(_code: string) {
    // mailws has no OAuth exchange; sessions are imported, not granted.
    return { tokens: {} }
  }

  public async getEmailAliases(): Promise<
    { email: string; name?: string; primary?: boolean }[]
  > {
    return [{ email: this.config.auth.email, primary: true }]
  }

  public async revokeToken(_token: string) {
    // Apple provides no third-party revocation for a web session. The stored
    // copy is destroyed with the connection row; the user signs the session out
    // from appleid.apple.com. Reporting success here would be a lie.
    return false
  }

  /* -------------------------------- read -------------------------------- */

  public async list(params: {
    folder: string
    query?: string
    maxResults?: number
    labelIds?: string[]
    pageToken?: string | number
  }) {
    return this.guard("list", async () => {
      const folder = await this.requireFolder(params.folder)
      const page = await listMessages(this.client, {
        folderGuid: folder.guid,
        limit: params.maxResults ?? DEFAULT_PAGE_SIZE,
        cursor:
          params.pageToken === undefined || params.pageToken === null
            ? null
            : String(params.pageToken),
        query: params.query,
      })
      return {
        threads: toThreadRows(page.messages),
        nextPageToken: page.nextCursor,
      }
    })
  }

  public async get(threadId: string): Promise<IGetThreadResponse> {
    return this.guard("get", async () => {
      const guids = await this.threadGuids(threadId)
      const details: ICloudMessageDetail[] = []
      for (const guid of guids.slice(0, MAX_THREAD_MESSAGES)) {
        const detail = await getMessage(this.client, { guid })
        details.push(detail)
      }
      details.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      const messages: ParsedMessage[] = []
      for (const detail of details) {
        messages.push(
          toParsedMessage(detail, {
            folder: await this.folderForMessage(detail),
          })
        )
      }

      const latest = messages[messages.length - 1]
      const folder = details[details.length - 1]
        ? await this.folderForMessage(details[details.length - 1]!)
        : undefined

      return {
        messages,
        latest,
        hasUnread: messages.some((message) => message.unread),
        totalReplies: messages.filter((message) => !message.isDraft).length,
        labels: folder ? [folderToLabel(folder)] : [],
        isLatestDraft: latest?.isDraft === true,
      }
    })
  }

  public async count() {
    return this.guard("count", async () => {
      const folders = await this.folders()
      const wanted: [string, ICloudFolder["role"]][] = [
        ["INBOX", "inbox"],
        ["DRAFT", "drafts"],
        ["SENT", "sent"],
      ]
      return wanted.map(([label, role]) => ({
        label,
        count: folders.find((folder) => folder.role === role)?.unreadCount ?? 0,
      }))
    })
  }

  /**
   * Messages that arrived since `historyId`.
   *
   * `historyId` is the epoch-milliseconds timestamp of the newest message seen
   * on the previous pass — mailws exposes no history cursor of its own, so the
   * message date is the only monotonic thing available.
   */
  public async listHistory<T>(historyId: string) {
    return this.guard("listHistory", async () => {
      const since = Number(historyId)
      const inbox = await this.folderByRole("inbox")
      if (!inbox) return { history: [] as T[], historyId }

      const page = await listMessages(this.client, {
        folderGuid: inbox.guid,
        limit: DEFAULT_PAGE_SIZE,
        cursor: null,
      })
      const cutoff = Number.isFinite(since) ? since : 0
      const fresh = page.messages.filter(
        (message) => new Date(message.date).getTime() > cutoff
      )
      const newest = page.messages.reduce(
        (max, message) => Math.max(max, new Date(message.date).getTime()),
        cutoff
      )
      return {
        history: fresh.map((message) => ({
          id: message.guid,
          type: "new",
        })) as unknown as T[],
        historyId: String(newest),
      }
    })
  }

  public async getRawEmail(messageId: string): Promise<string> {
    return this.guard("getRawEmail", () =>
      getRawMessage(this.client, messageId)
    )
  }

  public async getAttachment(messageId: string, attachmentId: string) {
    return this.guard("getAttachment", () =>
      getAttachment(this.client, { guid: messageId, attachmentId })
    )
  }

  public async getMessageAttachments(messageId: string) {
    return this.guard("getMessageAttachments", async () => {
      const detail = await getMessage(this.client, { guid: messageId })
      return detail.attachments.map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        attachmentId: attachment.attachmentId,
        headers: [] as { name: string; value: string }[],
        body: attachment.body,
      }))
    })
  }

  /* ------------------------------- mutate ------------------------------- */

  public normalizeIds(ids: string[]) {
    return { threadIds: ids }
  }

  public async markAsRead(threadIds: string[]) {
    await this.setThreadFlags(threadIds, { unread: false })
  }

  public async markAsUnread(threadIds: string[]) {
    await this.setThreadFlags(threadIds, { unread: true })
  }

  private async setThreadFlags(
    threadIds: string[],
    flags: { unread?: boolean; flagged?: boolean }
  ) {
    await this.guard("setFlags", async () => {
      const guids = (
        await Promise.all(threadIds.map((id) => this.threadGuids(id)))
      ).flat()
      await setFlags(this.client, { guids, ...flags })
    })
  }

  /**
   * Maps the app's label vocabulary onto what mailws can actually do: a message
   * lives in exactly one folder, so a folder label being added is a move, and
   * STARRED/UNREAD are flags.
   */
  public async modifyLabels(
    threadIds: string[],
    options: { addLabels: string[]; removeLabels: string[] }
  ) {
    await this.guard("modifyLabels", async () => {
      const guids = (
        await Promise.all(threadIds.map((id) => this.threadGuids(id)))
      ).flat()
      if (guids.length === 0) return

      const add = options.addLabels.map((label) => label.toUpperCase())
      const remove = options.removeLabels.map((label) => label.toUpperCase())

      const flags: { unread?: boolean; flagged?: boolean } = {}
      if (add.includes("UNREAD")) flags.unread = true
      if (remove.includes("UNREAD")) flags.unread = false
      if (add.includes("STARRED")) flags.flagged = true
      if (remove.includes("STARRED")) flags.flagged = false
      if (flags.unread !== undefined || flags.flagged !== undefined) {
        await setFlags(this.client, { guids, ...flags })
      }

      const folders = await this.folders()
      const destinationLabel = add.find(
        (label) => label !== "UNREAD" && label !== "STARRED"
      )
      if (destinationLabel) {
        const destination = resolveFolder(folders, destinationLabel)
        if (!destination) {
          throw new Error(`Unknown iCloud folder: ${destinationLabel}`)
        }
        await moveMessages(this.client, {
          guids,
          toFolderGuid: destination.guid,
        })
        return
      }

      // Removing INBOX with nothing added is the app's "archive" gesture.
      if (remove.includes("INBOX")) {
        const archive =
          (await this.folderByRole("archive")) ??
          (await this.folderByRole("trash"))
        if (archive) {
          await moveMessages(this.client, {
            guids,
            toFolderGuid: archive.guid,
          })
        }
      }
    })
  }

  public async delete(threadId: string) {
    await this.guard("delete", async () => {
      const guids = await this.threadGuids(threadId)
      await deleteMessages(this.client, guids)
    })
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return this.guard("deleteAllSpam", async () => {
      const junk = await this.folderByRole("junk")
      if (!junk) {
        return { success: false, message: "No Junk folder on this account" }
      }
      const count = junk.totalCount ?? 0
      await emptyFolder(this.client, junk.guid)
      return {
        success: true,
        message: count
          ? `Deleted ${count} junk messages`
          : "Junk folder emptied",
        count,
      }
    })
  }

  /* ------------------------------- labels ------------------------------- */

  public async getUserLabels(): Promise<Label[]> {
    return this.guard("getUserLabels", async () =>
      (await this.folders()).map(folderToLabel)
    )
  }

  public async getLabel(id: string): Promise<Label> {
    const folders = await this.folders()
    const folder = resolveFolder(folders, id)
    if (!folder) throw new Error(`Label not found: ${id}`)
    return folderToLabel(folder)
  }

  public async createLabel(label: { name: string }) {
    await this.guard("createLabel", () =>
      createFolder(this.client, { name: label.name })
    )
  }

  public async updateLabel(id: string, label: { name: string }) {
    await this.guard("updateLabel", async () => {
      const folder = await this.requireFolder(id)
      await renameFolder(this.client, { guid: folder.guid, name: label.name })
      this.folderCache = null
    })
  }

  public async deleteLabel(id: string) {
    await this.guard("deleteLabel", async () => {
      const folder = await this.requireFolder(id)
      await deleteFolder(this.client, folder.guid)
      this.folderCache = null
    })
  }

  /* ------------------------------- drafts ------------------------------- */

  public async listDrafts(params: {
    q?: string
    maxResults?: number
    pageToken?: string
  }) {
    return this.guard("listDrafts", async () => {
      const drafts = await this.folderByRole("drafts")
      if (!drafts) return { threads: [], nextPageToken: null }
      const page = await listMessages(this.client, {
        folderGuid: drafts.guid,
        limit: params.maxResults ?? DEFAULT_PAGE_SIZE,
        cursor: params.pageToken ?? null,
        query: params.q,
      })
      return {
        threads: page.messages.map((message) => ({
          id: message.guid,
          historyId: String(new Date(message.date).getTime()),
          $raw: message,
        })),
        nextPageToken: page.nextCursor,
      }
    })
  }

  public async getDraft(draftId: string): Promise<ParsedDraft> {
    return this.guard("getDraft", async () => {
      const detail = await getMessage(this.client, { guid: draftId })
      return {
        id: detail.guid,
        to: detail.to.map((address) => address.email),
        cc: detail.cc.map((address) => address.email),
        bcc: detail.bcc.map((address) => address.email),
        subject: detail.subject,
        content: detail.html ?? detail.text ?? "",
        rawMessage: { internalDate: detail.date },
      }
    })
  }

  public async deleteDraft(draftId: string) {
    await this.guard("deleteDraft", () =>
      deleteMessages(this.client, [draftId])
    )
  }

  /* ------------------------------ compose ------------------------------- */
  /*
   * Apple's compose and draft-save endpoints are not part of the captured
   * `/wm/*` surface. Rather than guess at a payload that would send mail on the
   * user's behalf, these report the operation as unsupported; the router driver
   * falls back to SMTP when the connection still holds an app-specific
   * password, and otherwise the user gets a clear message instead of a
   * silently-lost email.
   */

  public async create(
    _data: IOutgoingMessage
  ): Promise<{ id?: string | null }> {
    throw new ICloudUnsupportedOperationError(
      "send",
      "Sending mail over the iCloud web service is not supported yet. Add an app-specific password to this connection to send."
    )
  }

  public async sendDraft(_draftId: string, _data: IOutgoingMessage) {
    throw new ICloudUnsupportedOperationError(
      "sendDraft",
      "Sending mail over the iCloud web service is not supported yet. Add an app-specific password to this connection to send."
    )
  }

  public async createDraft(
    _data: CreateDraftData
  ): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    throw new ICloudUnsupportedOperationError(
      "createDraft",
      "Saving drafts over the iCloud web service is not supported yet. Add an app-specific password to this connection to save drafts."
    )
  }
}
