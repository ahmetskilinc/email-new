import type {
  DeleteAllSpamResponse,
  IOutgoingMessage,
  Label,
} from "../../types"
import type {
  IGetThreadResponse,
  MailManager,
  ManagerConfig,
  ParsedDraft,
} from "./types"
import type { CreateDraftData } from "../schemas"
import { ICloudImapMailManager } from "./icloud-imap"
import { ICloudWebServiceMailManager } from "./icloud-webservice"
import {
  ICloudReauthRequiredError,
  ICloudUnsupportedOperationError,
  ICloudProtocolError,
} from "../transport/icloud/errors"

const ICLOUD_SCOPE = "icloud"

/**
 * iCloud Mail provider.
 *
 * Routes each operation to Apple's `mailws` web service when the connection
 * carries an authenticated iCloud.com session, and to IMAP/SMTP otherwise.
 *
 * The two paths coexist deliberately. `mailws` is what iCloud.com itself uses
 * and gives iCloud a Gmail-API-shaped provider — but it is reverse engineered
 * and unsupported, and Apple's compose endpoint is not part of the protocol we
 * can rely on. So the web service handles reading and mailbox mutation, and an
 * app-specific password (when the connection still has one) covers sending and
 * anything the web service reports it cannot do. A session that Apple has
 * invalidated degrades to IMAP rather than to an empty mailbox.
 */
export class ICloudMailManager implements MailManager {
  private readonly webService: ICloudWebServiceMailManager | null
  private readonly imap: ICloudImapMailManager | null

  constructor(public config: ManagerConfig) {
    this.webService = config.icloud?.session
      ? new ICloudWebServiceMailManager(config)
      : null

    // The app password lives in `accessToken`. Session-only connections store
    // an empty string there, and IMAP with an empty password is not a fallback,
    // it is a guaranteed auth failure — so don't build one.
    this.imap = config.auth.accessToken
      ? new ICloudImapMailManager(config)
      : null

    if (!this.webService && !this.imap) {
      throw new Error(
        "iCloud connection has neither an iCloud session nor an app-specific password"
      )
    }
  }

  /** True when this connection is reading through Apple's web service. */
  public get usesWebService(): boolean {
    return this.webService !== null
  }

  /**
   * Runs `viaWebService`, falling back to IMAP when the web service cannot
   * serve the operation.
   *
   * Only two failures fall back: the operation is outside the protocol we know
   * (`Unsupported`), or Apple changed/rejected it (`Protocol`, `Reauth`). A
   * genuine mailbox error — a bad folder, a missing message — is the answer,
   * and retrying it over IMAP would just produce a slower version of the same
   * error.
   */
  private async route<T>(
    operation: string,
    viaWebService: (manager: ICloudWebServiceMailManager) => Promise<T>,
    viaImap: (manager: ICloudImapMailManager) => Promise<T>
  ): Promise<T> {
    if (this.webService) {
      try {
        return await viaWebService(this.webService)
      } catch (error) {
        const recoverable =
          error instanceof ICloudUnsupportedOperationError ||
          error instanceof ICloudReauthRequiredError ||
          error instanceof ICloudProtocolError
        if (!recoverable || !this.imap) throw error
        console.warn(
          `[icloud] ${operation}: falling back to IMAP —`,
          error instanceof Error ? error.message : error
        )
        return viaImap(this.imap)
      }
    }
    if (!this.imap) {
      throw new Error("iCloud connection is not usable; reconnect the account.")
    }
    return viaImap(this.imap)
  }

  public getScope(): string {
    return ICLOUD_SCOPE
  }

  public async getUserInfo(tokens?: ManagerConfig["auth"]) {
    return this.route(
      "getUserInfo",
      (manager) => manager.getUserInfo(),
      (manager) => manager.getUserInfo(tokens)
    )
  }

  public async getTokens(code: string) {
    return this.route(
      "getTokens",
      (manager) => manager.getTokens(code),
      (manager) => manager.getTokens(code)
    )
  }

  public async list(params: {
    folder: string
    query?: string
    maxResults?: number
    labelIds?: string[]
    pageToken?: string | number
  }) {
    return this.route(
      "list",
      (manager) => manager.list(params),
      (manager) => manager.list(params)
    )
  }

  public async get(threadId: string): Promise<IGetThreadResponse> {
    return this.route(
      "get",
      (manager) => manager.get(threadId),
      (manager) => manager.get(threadId)
    )
  }

  public async count() {
    return this.route(
      "count",
      (manager) => manager.count(),
      (manager) => manager.count()
    )
  }

  public async listHistory<T>(historyId: string) {
    return this.route<{ history: T[]; historyId: string }>(
      "listHistory",
      (manager) => manager.listHistory<T>(historyId),
      (manager) => manager.listHistory<T>(historyId)
    )
  }

  public async getRawEmail(messageId: string): Promise<string> {
    return this.route(
      "getRawEmail",
      (manager) => manager.getRawEmail(messageId),
      (manager) => manager.getRawEmail(messageId)
    )
  }

  public async getAttachment(messageId: string, attachmentId: string) {
    return this.route(
      "getAttachment",
      (manager) => manager.getAttachment(messageId, attachmentId),
      (manager) => manager.getAttachment(messageId, attachmentId)
    )
  }

  public async getMessageAttachments(messageId: string) {
    return this.route(
      "getMessageAttachments",
      (manager) => manager.getMessageAttachments(messageId),
      (manager) => manager.getMessageAttachments(messageId)
    )
  }

  public normalizeIds(ids: string[]) {
    return { threadIds: ids }
  }

  public async markAsRead(threadIds: string[]) {
    await this.route(
      "markAsRead",
      (manager) => manager.markAsRead(threadIds),
      (manager) => manager.markAsRead(threadIds)
    )
  }

  public async markAsUnread(threadIds: string[]) {
    await this.route(
      "markAsUnread",
      (manager) => manager.markAsUnread(threadIds),
      (manager) => manager.markAsUnread(threadIds)
    )
  }

  public async modifyLabels(
    threadIds: string[],
    options: { addLabels: string[]; removeLabels: string[] }
  ) {
    await this.route(
      "modifyLabels",
      (manager) => manager.modifyLabels(threadIds, options),
      (manager) => manager.modifyLabels(threadIds, options)
    )
  }

  public async delete(threadId: string) {
    await this.route(
      "delete",
      (manager) => manager.delete(threadId),
      (manager) => manager.delete(threadId)
    )
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return this.route(
      "deleteAllSpam",
      (manager) => manager.deleteAllSpam(),
      (manager) => manager.deleteAllSpam()
    )
  }

  public async getUserLabels(): Promise<Label[]> {
    return this.route(
      "getUserLabels",
      (manager) => manager.getUserLabels(),
      (manager) => manager.getUserLabels()
    )
  }

  public async getLabel(id: string): Promise<Label> {
    return this.route(
      "getLabel",
      (manager) => manager.getLabel(id),
      (manager) => manager.getLabel(id)
    )
  }

  public async createLabel(label: {
    name: string
    color?: { backgroundColor: string; textColor: string }
  }) {
    await this.route(
      "createLabel",
      (manager) => manager.createLabel(label),
      (manager) => manager.createLabel(label)
    )
  }

  public async updateLabel(
    id: string,
    label: {
      name: string
      color?: { backgroundColor: string; textColor: string }
    }
  ) {
    await this.route(
      "updateLabel",
      (manager) => manager.updateLabel(id, label),
      (manager) => manager.updateLabel(id, label)
    )
  }

  public async deleteLabel(id: string) {
    await this.route(
      "deleteLabel",
      (manager) => manager.deleteLabel(id),
      (manager) => manager.deleteLabel(id)
    )
  }

  public async listDrafts(params: {
    q?: string
    maxResults?: number
    pageToken?: string
  }) {
    return this.route(
      "listDrafts",
      (manager) => manager.listDrafts(params),
      (manager) => manager.listDrafts(params)
    )
  }

  public async getDraft(draftId: string): Promise<ParsedDraft> {
    return this.route(
      "getDraft",
      (manager) => manager.getDraft(draftId),
      (manager) => manager.getDraft(draftId)
    )
  }

  public async createDraft(data: CreateDraftData) {
    return this.route<{
      id?: string | null
      success?: boolean
      error?: string
    }>(
      "createDraft",
      (manager) => manager.createDraft(data),
      (manager) => manager.createDraft(data)
    )
  }

  public async deleteDraft(draftId: string) {
    await this.route(
      "deleteDraft",
      (manager) => manager.deleteDraft(draftId),
      (manager) => manager.deleteDraft(draftId)
    )
  }

  public async create(data: IOutgoingMessage) {
    return this.route(
      "create",
      (manager) => manager.create(data),
      (manager) => manager.create(data)
    )
  }

  public async sendDraft(draftId: string, data: IOutgoingMessage) {
    await this.route(
      "sendDraft",
      (manager) => manager.sendDraft(draftId, data),
      (manager) => manager.sendDraft(draftId, data)
    )
  }

  public async getEmailAliases() {
    return this.route<{ email: string; name?: string; primary?: boolean }[]>(
      "getEmailAliases",
      (manager) => manager.getEmailAliases(),
      (manager) => manager.getEmailAliases()
    )
  }

  /**
   * Revoking is credential-specific rather than routed: the web session and the
   * app-specific password are separate grants, and neither one can be revoked
   * by the other. Success means at least one upstream revocation worked.
   */
  public async revokeToken(token: string) {
    const results = await Promise.all([
      this.webService?.revokeToken(token) ?? Promise.resolve(false),
      this.imap?.revokeToken(token) ?? Promise.resolve(false),
    ])
    return results.some(Boolean)
  }
}
