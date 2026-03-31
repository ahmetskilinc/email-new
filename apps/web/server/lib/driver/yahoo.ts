// @ts-nocheck
import type {
  IOutgoingMessage,
  Label,
  ParsedMessage,
  DeleteAllSpamResponse,
} from '../../types';
import type { MailManager, ManagerConfig, IGetThreadResponse, ParsedDraft } from './types';
import type { CreateDraftData } from '../schemas';
import {
  countUnread,
  deleteAllSpam,
  deleteMessages,
  getAliases,
  getAttachment,
  getMessageAttachments,
  getRawEmail,
  getThread,
  listFolders,
  listHistory,
  listThreads,
  markMessages,
  modifyLabels,
  validateCredentials,
} from '../transport/imap';
import { createDraft, deleteDraft, getDraft, listDrafts, sendDraft, sendEmail } from '../transport/smtp';
import { YAHOO_CONFIG } from '../transport/provider-config';

const YAHOO_SCOPE = 'yahoo';

export class YahooMailManager implements MailManager {
  constructor(public config: ManagerConfig) {}

  private get creds() {
    return {
      email: this.config.auth.email,
      password: this.config.auth.accessToken,
    };
  }

  public getScope(): string {
    return YAHOO_SCOPE;
  }

  public async getUserInfo(tokens?: ManagerConfig['auth']) {
    const email = tokens?.email ?? this.config.auth.email;
    const password = tokens?.accessToken ?? this.config.auth.accessToken;
    const data = await validateCredentials(email, password, YAHOO_CONFIG);
    return { address: data.email, name: data.name, photo: '' };
  }

  public async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }) {
    return listThreads(this.creds.email, this.creds.password, {
      folder: params.folder,
      query: params.query,
      maxResults: params.maxResults ?? 50,
      pageToken: (params.pageToken as string) ?? null,
    }, YAHOO_CONFIG);
  }

  public async get(threadId: string): Promise<IGetThreadResponse> {
    return getThread(this.creds.email, this.creds.password, threadId, YAHOO_CONFIG) as Promise<IGetThreadResponse>;
  }

  public async create(data: IOutgoingMessage) {
    return sendEmail(this.creds.email, this.creds.password, data, YAHOO_CONFIG);
  }

  public async sendDraft(draftId: string, data: IOutgoingMessage) {
    await sendDraft(this.creds.email, this.creds.password, draftId, data, YAHOO_CONFIG);
  }

  public async createDraft(data: CreateDraftData) {
    return createDraft(this.creds.email, this.creds.password, data, YAHOO_CONFIG);
  }

  public async getDraft(draftId: string): Promise<ParsedDraft> {
    return getDraft(this.creds.email, this.creds.password, draftId, YAHOO_CONFIG) as Promise<ParsedDraft>;
  }

  public async listDrafts(params: {
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }) {
    return listDrafts(this.creds.email, this.creds.password, params, YAHOO_CONFIG);
  }

  public async delete(threadId: string) {
    await deleteMessages(this.creds.email, this.creds.password, threadId, YAHOO_CONFIG);
  }

  public async deleteDraft(draftId: string) {
    await deleteDraft(this.creds.email, this.creds.password, draftId, YAHOO_CONFIG);
  }

  public async count() {
    return countUnread(this.creds.email, this.creds.password, YAHOO_CONFIG);
  }

  public async getTokens(_code: string) {
    return { tokens: {} };
  }

  public async listHistory<T>(historyId: string) {
    return listHistory(this.creds.email, this.creds.password, historyId, YAHOO_CONFIG) as Promise<{
      history: T[];
      historyId: string;
    }>;
  }

  public async markAsRead(threadIds: string[]) {
    await markMessages(this.creds.email, this.creds.password, threadIds, true, YAHOO_CONFIG);
  }

  public async markAsUnread(threadIds: string[]) {
    await markMessages(this.creds.email, this.creds.password, threadIds, false, YAHOO_CONFIG);
  }

  public normalizeIds(ids: string[]) {
    return { threadIds: ids };
  }

  public async modifyLabels(
    threadIds: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ) {
    await modifyLabels(
      this.creds.email,
      this.creds.password,
      threadIds,
      options.addLabels,
      options.removeLabels,
      YAHOO_CONFIG,
    );
  }

  public async getAttachment(messageId: string, attachmentId: string) {
    return getAttachment(this.creds.email, this.creds.password, messageId, attachmentId, YAHOO_CONFIG);
  }

  public async getMessageAttachments(messageId: string) {
    return getMessageAttachments(this.creds.email, this.creds.password, messageId, YAHOO_CONFIG);
  }

  public async getUserLabels(): Promise<Label[]> {
    return listFolders(this.creds.email, this.creds.password, YAHOO_CONFIG) as Promise<Label[]>;
  }

  public async getLabel(id: string): Promise<Label> {
    const labels = await this.getUserLabels();
    const found = labels.find((l) => l.id === id);
    if (!found) throw new Error(`Label not found: ${id}`);
    return found;
  }

  public async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }) {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: YAHOO_CONFIG.imapHost,
      port: YAHOO_CONFIG.imapPort,
      secure: true,
      auth: { user: this.creds.email, pass: this.creds.password },
      logger: false,
    });
    await client.connect();
    await client.mailboxCreate(label.name);
    await client.logout().catch(() => {});
  }

  public async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ) {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: YAHOO_CONFIG.imapHost,
      port: YAHOO_CONFIG.imapPort,
      secure: true,
      auth: { user: this.creds.email, pass: this.creds.password },
      logger: false,
    });
    await client.connect();
    await client.mailboxRename(id, label.name);
    await client.logout().catch(() => {});
  }

  public async deleteLabel(id: string) {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: YAHOO_CONFIG.imapHost,
      port: YAHOO_CONFIG.imapPort,
      secure: true,
      auth: { user: this.creds.email, pass: this.creds.password },
      logger: false,
    });
    await client.connect();
    await client.mailboxDelete(id);
    await client.logout().catch(() => {});
  }

  public async getEmailAliases() {
    return getAliases(this.creds.email);
  }

  public async revokeToken(_token: string) {
    return true;
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return deleteAllSpam(this.creds.email, this.creds.password, YAHOO_CONFIG);
  }

  public async getRawEmail(messageId: string): Promise<string> {
    return getRawEmail(this.creds.email, this.creds.password, messageId, YAHOO_CONFIG);
  }
}
