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

const ICLOUD_SCOPE = 'icloud';

export class ICloudMailManager implements MailManager {
  constructor(public config: ManagerConfig) {}

  private get creds() {
    return {
      email: this.config.auth.email,
      password: this.config.auth.accessToken,
    };
  }

  public getScope(): string {
    return ICLOUD_SCOPE;
  }

  public async getUserInfo(tokens?: ManagerConfig['auth']) {
    const email = tokens?.email ?? this.config.auth.email;
    const password = tokens?.accessToken ?? this.config.auth.accessToken;
    const data = await validateCredentials(email, password);
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
    });
  }

  public async get(threadId: string): Promise<IGetThreadResponse> {
    return getThread(this.creds.email, this.creds.password, threadId) as Promise<IGetThreadResponse>;
  }

  public async create(data: IOutgoingMessage) {
    return sendEmail(this.creds.email, this.creds.password, data);
  }

  public async sendDraft(draftId: string, data: IOutgoingMessage) {
    await sendDraft(this.creds.email, this.creds.password, draftId, data);
  }

  public async createDraft(data: CreateDraftData) {
    return createDraft(this.creds.email, this.creds.password, data);
  }

  public async getDraft(draftId: string): Promise<ParsedDraft> {
    return getDraft(this.creds.email, this.creds.password, draftId) as Promise<ParsedDraft>;
  }

  public async listDrafts(params: {
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }) {
    return listDrafts(this.creds.email, this.creds.password, params);
  }

  public async delete(threadId: string) {
    await deleteMessages(this.creds.email, this.creds.password, threadId);
  }

  public async deleteDraft(draftId: string) {
    await deleteDraft(this.creds.email, this.creds.password, draftId);
  }

  public async count() {
    return countUnread(this.creds.email, this.creds.password);
  }

  public async getTokens(_code: string) {
    return { tokens: {} };
  }

  public async listHistory<T>(historyId: string) {
    return listHistory(this.creds.email, this.creds.password, historyId) as Promise<{
      history: T[];
      historyId: string;
    }>;
  }

  public async markAsRead(threadIds: string[]) {
    await markMessages(this.creds.email, this.creds.password, threadIds, true);
  }

  public async markAsUnread(threadIds: string[]) {
    await markMessages(this.creds.email, this.creds.password, threadIds, false);
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
    );
  }

  public async getAttachment(messageId: string, attachmentId: string) {
    return getAttachment(this.creds.email, this.creds.password, messageId, attachmentId);
  }

  public async getMessageAttachments(messageId: string) {
    return getMessageAttachments(this.creds.email, this.creds.password, messageId);
  }

  public async getUserLabels(): Promise<Label[]> {
    return listFolders(this.creds.email, this.creds.password) as Promise<Label[]>;
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
      host: 'imap.mail.me.com',
      port: 993,
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
      host: 'imap.mail.me.com',
      port: 993,
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
      host: 'imap.mail.me.com',
      port: 993,
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
    // iCloud app-specific passwords cannot be revoked programmatically
    return true;
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return deleteAllSpam(this.creds.email, this.creds.password);
  }

  public async getRawEmail(messageId: string): Promise<string> {
    return getRawEmail(this.creds.email, this.creds.password, messageId);
  }
}
