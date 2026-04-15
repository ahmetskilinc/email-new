import { contextBridge, ipcRenderer } from "electron"

const api = {
  mail: {
    listThreads: (folder: string, query?: string, maxResults?: number, cursor?: string, labelIds?: string[]) =>
      ipcRenderer.invoke("mail:listThreads", folder, query, maxResults, cursor, labelIds),
    listAllInboxes: (maxResults?: number, cursor?: string) =>
      ipcRenderer.invoke("mail:listAllInboxes", maxResults, cursor),
    getThread: (id: string, connectionId?: string) =>
      ipcRenderer.invoke("mail:getThread", id, connectionId),
    sendMail: (data: unknown) => ipcRenderer.invoke("mail:sendMail", data),
    markAsRead: (threadIds: string[], connectionId?: string) =>
      ipcRenderer.invoke("mail:markAsRead", threadIds, connectionId),
    markAsUnread: (threadIds: string[]) =>
      ipcRenderer.invoke("mail:markAsUnread", threadIds),
    deleteThread: (id: string) => ipcRenderer.invoke("mail:deleteThread", id),
    modifyLabels: (ids: string[], options: { addLabels: string[]; removeLabels: string[] }) =>
      ipcRenderer.invoke("mail:modifyLabels", ids, options),
    processEmailContent: (html: string, shouldLoadImages: boolean, theme: "light" | "dark") =>
      ipcRenderer.invoke("mail:processEmailContent", html, shouldLoadImages, theme),
    toggleStar: (threadIds: string[], starred: boolean) =>
      ipcRenderer.invoke("mail:toggleStar", threadIds, starred),
    getRawEmail: (id: string) => ipcRenderer.invoke("mail:getRawEmail", id),
    count: () => ipcRenderer.invoke("mail:count"),
    getEmailAliases: () => ipcRenderer.invoke("mail:getEmailAliases"),
    getMessageAttachments: (messageId: string) =>
      ipcRenderer.invoke("mail:getMessageAttachments", messageId),
    unsubscribeFromList: (input: { listUnsubscribe: string; listUnsubscribePost?: string }) =>
      ipcRenderer.invoke("mail:unsubscribeFromList", input),
    sendDraft: (draftId: string, data: unknown) =>
      ipcRenderer.invoke("mail:sendDraft", draftId, data),
    deleteDraft: (draftId: string) => ipcRenderer.invoke("mail:deleteDraft", draftId),
    getDraft: (draftId: string) => ipcRenderer.invoke("mail:getDraft", draftId),
    getAttachment: (messageId: string, attachmentId: string) =>
      ipcRenderer.invoke("mail:getAttachment", messageId, attachmentId),
    createLabel: (label: { name: string; color?: { backgroundColor: string; textColor: string } }) =>
      ipcRenderer.invoke("mail:createLabel", label),
    updateLabel: (id: string, label: { name: string; color?: { backgroundColor: string; textColor: string } }) =>
      ipcRenderer.invoke("mail:updateLabel", id, label),
    deleteLabel: (id: string) => ipcRenderer.invoke("mail:deleteLabel", id),
  },
  connections: {
    list: () => ipcRenderer.invoke("connections:list"),
    setDefault: (id: string) => ipcRenderer.invoke("connections:setDefault", id),
    delete: (id: string) => ipcRenderer.invoke("connections:delete", id),
    createImap: (providerId: string, email: string, data: unknown) =>
      ipcRenderer.invoke("connections:createImap", providerId, email, data),
  },
  calendar: {
    getEvents: (timeMin: string, timeMax: string) =>
      ipcRenderer.invoke("calendar:getEvents", timeMin, timeMax),
    getCalendars: () => ipcRenderer.invoke("calendar:getCalendars"),
    createEvent: (input: unknown) => ipcRenderer.invoke("calendar:createEvent", input),
    updateEvent: (input: unknown) => ipcRenderer.invoke("calendar:updateEvent", input),
    deleteEvent: (input: unknown) => ipcRenderer.invoke("calendar:deleteEvent", input),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  },
  signatures: {
    list: (connectionId?: string) => ipcRenderer.invoke("signatures:list", connectionId),
    create: (data: unknown) => ipcRenderer.invoke("signatures:create", data),
    update: (id: string, data: unknown) => ipcRenderer.invoke("signatures:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("signatures:delete", id),
  },
  labels: {
    list: () => ipcRenderer.invoke("labels:list"),
  },
  drafts: {
    list: () => ipcRenderer.invoke("drafts:list"),
    create: (data: unknown) => ipcRenderer.invoke("drafts:create", data),
  },
  contacts: {
    search: (query: string) => ipcRenderer.invoke("contacts:search", query),
  },
  events: {
    onMailSynced: (
      handler: (payload: {
        connections: { connectionId: string; email: string; count: number }[]
        at: number
      }) => void,
    ) => {
      const listener = (_e: unknown, payload: unknown) =>
        handler(payload as Parameters<typeof handler>[0])
      ipcRenderer.on("mail:synced", listener)
      return () => ipcRenderer.off("mail:synced", listener)
    },
  },
  auth: {
    getOAuthConfig: () =>
      ipcRenderer.invoke("auth:getOAuthConfig") as Promise<{
        google: { clientId: string; clientSecret: string } | null
        microsoft: { clientId: string; clientSecret: string } | null
      }>,
    getUser: () => ipcRenderer.invoke("auth:getUser"),
    createLocalUser: (data: { name: string; email: string }) =>
      ipcRenderer.invoke("auth:createLocalUser", data),
    deleteUser: () => ipcRenderer.invoke("auth:deleteUser"),
    updateUser: (fields: { name?: string }) =>
      ipcRenderer.invoke("auth:updateUser", fields),
    changePassword: (opts: { currentPassword: string; newPassword: string }) =>
      ipcRenderer.invoke("auth:changePassword", opts),
    startGoogleOAuth: (clientId: string, clientSecret: string) =>
      ipcRenderer.invoke("auth:startGoogleOAuth", clientId, clientSecret),
    startMicrosoftOAuth: (clientId: string, clientSecret: string) =>
      ipcRenderer.invoke("auth:startMicrosoftOAuth", clientId, clientSecret),
    connectGoogle: () =>
      ipcRenderer.invoke("auth:connectGoogle") as Promise<{
        userId: string
        connectionId: string
        email: string
      }>,
    connectMicrosoft: () =>
      ipcRenderer.invoke("auth:connectMicrosoft") as Promise<{
        userId: string
        connectionId: string
        email: string
      }>,
  },
}

export type ElectronApi = typeof api

contextBridge.exposeInMainWorld("api", api)
