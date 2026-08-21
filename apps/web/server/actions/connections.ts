"use server"

import { requireSession } from "../lib/session"
import {
  connectionToDriver,
  getActiveConnection,
  getzeitmailDB,
  resolveAccessToken,
  resolveRefreshToken,
} from "../lib/server-utils"
import { autoDiscoverFolders } from "../lib/transport/provider-config"
import { assertValidMailEndpoints } from "../lib/transport/host-validation"
import { logSecurityEvent } from "../lib/audit"
import { createDriver } from "../lib/driver"
import { encrypt } from "../lib/encryption"
import { isIcloudWebServiceEnabled } from "../env"
import { discoverWebServices } from "../lib/transport/icloud/bootstrap"
import {
  ICloudSessionInputError,
  buildSession,
  parseSessionInput,
  redactSession,
  serializeSession,
} from "../lib/transport/icloud/session"
import { ICloudReauthRequiredError } from "../lib/transport/icloud/errors"
import { EProviders } from "../types"

export async function listConnections() {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const connections = await db.findManyConnections()

  const appPasswordProviders = ["icloud", "yahoo", "custom"]
  const disconnectedIds = connections
    .filter((c) => {
      // An iCloud connection authenticated by a web session has no access token
      // to check; the encrypted session is its credential. A session Apple has
      // invalidated counts as disconnected so the UI prompts for a reconnect.
      const hasCredential = Boolean(c.accessToken || c.webSession)
      if (!hasCredential) return true
      if (
        c.providerId === "icloud" &&
        !c.accessToken &&
        c.connectionState &&
        c.connectionState !== "connected"
      ) {
        return true
      }
      return !appPasswordProviders.includes(c.providerId) && !c.refreshToken
    })
    .map((c) => c.id)

  return {
    connections: connections.map((connection) => ({
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
      // Whether this connection reads through Apple's web service, and whether
      // its credential still works. Never the credential itself.
      usesWebService: Boolean(connection.webSession),
      connectionState: connection.connectionState ?? "connected",
    })),
    disconnectedIds,
  }
}

export async function setDefaultConnection(connectionId: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const foundConnection = await db.findUserConnection(connectionId)
  if (!foundConnection) throw new Error("Connection not found")
  await db.updateUser({ defaultConnectionId: connectionId })
}

export async function deleteConnection(connectionId: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  // Revoke the grant upstream BEFORE deleting the row — the row holds the only
  // copy of the token needed to do it. Best-effort: a provider-side failure
  // must not strand the connection in the user's account.
  const existing = await db.findUserConnection(connectionId)
  if (existing) {
    try {
      const driver = connectionToDriver(existing)
      const token =
        resolveRefreshToken(existing) || resolveAccessToken(existing)
      if (token) await driver.revokeToken(token)
    } catch (error) {
      console.error(
        "[deleteConnection] upstream revocation failed for connection",
        connectionId,
        error instanceof Error ? error.message : error
      )
    }
  }

  await db.deleteConnection(connectionId)
  await logSecurityEvent("connection_removed", session.user.id, {
    connectionId,
    providerId: existing?.providerId ?? null,
  })

  // Compare against the stored default, not getActiveConnection(): after the
  // row is gone that helper silently falls back to another connection, so the
  // old check could never match and the user row kept pointing at a deleted
  // connection — leaving the client and server disagreeing on which account
  // is active.
  const userData = await db.findUser()
  if (userData?.defaultConnectionId === connectionId) {
    await db.updateUser({ defaultConnectionId: null })
  }
}

export async function getDefaultConnection() {
  try {
    const session = await requireSession()
    const connection = await getActiveConnection(session.user.id).catch(
      () => null
    )
    if (!connection) return null
    return {
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
    }
  } catch {
    return null
  }
}

export async function createIcloudConnection(email: string, password: string) {
  const session = await requireSession()

  const normalizedEmail = email.trim()
  const normalizedPassword = password.trim()
  const validDomains = ["icloud.com", "me.com", "mac.com"]
  const domain = normalizedEmail.split("@")[1]?.toLowerCase()
  if (!domain || !validDomains.includes(domain)) {
    throw new Error(
      "Only iCloud email addresses are supported (icloud.com, me.com, mac.com)"
    )
  }

  const driver = createDriver(EProviders.icloud, {
    auth: {
      userId: session.user.id,
      accessToken: normalizedPassword,
      refreshToken: "",
      email: normalizedEmail,
    },
  })

  const userInfo = await driver.getUserInfo().catch(() => {
    throw new Error(
      "Invalid iCloud credentials. Please check your email and app-specific password."
    )
  })

  const db = await getzeitmailDB(session.user.id)
  await db.createConnection(EProviders.icloud, userInfo.address, {
    name: userInfo.name || normalizedEmail.split("@")[0],
    picture: "",
    accessToken: encrypt(normalizedPassword),
    refreshToken: null as string | null,
    scope: "icloud",
    expiresAt: new Date("2099-12-31"),
  })

  await logSecurityEvent("connection_added", session.user.id, {
    providerId: "icloud",
  })

  return { success: true }
}

export async function createYahooConnection(email: string, password: string) {
  const session = await requireSession()

  const validDomains = [
    "yahoo.com",
    "ymail.com",
    "rocketmail.com",
    "yahoo.co.uk",
    "yahoo.co.in",
    "yahoo.ca",
    "yahoo.com.au",
  ]
  const domain = email.split("@")[1]
  if (
    !domain ||
    !validDomains.some(
      (d) =>
        domain.toLowerCase() === d || domain.toLowerCase().startsWith("yahoo.")
    )
  ) {
    throw new Error(
      "Only Yahoo email addresses are supported (yahoo.com, ymail.com, rocketmail.com, etc.)"
    )
  }

  const driver = createDriver(EProviders.yahoo, {
    auth: {
      userId: session.user.id,
      accessToken: password,
      refreshToken: "",
      email,
    },
  })

  const userInfo = await driver.getUserInfo().catch(() => {
    throw new Error(
      "Invalid Yahoo credentials. Please check your email and app password."
    )
  })

  const db = await getzeitmailDB(session.user.id)
  await db.createConnection(EProviders.yahoo, userInfo.address, {
    name: userInfo.name || email.split("@")[0],
    picture: "",
    accessToken: encrypt(password),
    refreshToken: null as string | null,
    scope: "yahoo",
    expiresAt: new Date("2099-12-31"),
  })

  await logSecurityEvent("connection_added", session.user.id, {
    providerId: "yahoo",
  })

  return { success: true }
}

export async function createCustomConnection(
  email: string,
  password: string,
  imapHost: string,
  imapPort: number,
  smtpHost: string,
  smtpPort: number
) {
  const session = await requireSession()

  // The caller names the host and port the server will connect to. Without this
  // the action is a general-purpose SSRF probe against the internal network.
  await assertValidMailEndpoints({ imapHost, imapPort, smtpHost, smtpPort })

  const discoveredFolders = await autoDiscoverFolders(
    email,
    password,
    imapHost,
    imapPort
  ).catch(() => {
    throw new Error(
      "Could not connect to IMAP server. Please check your credentials and server settings."
    )
  })

  const imapConfig = {
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
    smtpSecure: smtpPort === 465,
    smtpRequireTLS: smtpPort !== 465,
    folders: discoveredFolders,
  }

  const driver = createDriver(EProviders.custom, {
    auth: {
      userId: session.user.id,
      accessToken: password,
      refreshToken: "",
      email,
    },
    imapConfig,
  })

  const userInfo = await driver.getUserInfo().catch(() => {
    throw new Error(
      "Invalid credentials. Please check your email and password."
    )
  })

  const db = await getzeitmailDB(session.user.id)
  await db.createConnection(EProviders.custom, userInfo.address, {
    name: userInfo.name || email.split("@")[0],
    picture: "",
    accessToken: encrypt(password),
    refreshToken: null as string | null,
    scope: "custom",
    expiresAt: new Date("2099-12-31"),
    imapConfig,
  })

  await logSecurityEvent("connection_added", session.user.id, {
    providerId: "custom",
    imapHost,
    smtpHost,
  })

  return { success: true }
}

/** Whether the experimental iCloud web-service flow may be offered in the UI. */
export async function icloudWebServiceAvailable() {
  return isIcloudWebServiceEnabled()
}

const ICLOUD_DOMAINS = ["icloud.com", "me.com", "mac.com"]

function assertIcloudAddress(address: string) {
  const domain = address.split("@")[1]?.toLowerCase()
  if (!domain || !ICLOUD_DOMAINS.includes(domain)) {
    throw new Error(
      "That session does not belong to an iCloud Mail account (icloud.com, me.com, mac.com)."
    )
  }
}

/**
 * Validates a captured iCloud.com session and turns it into a usable
 * credential: Apple's bootstrap confirms the session works, tells us the
 * account identifier, and names the account-specific `pXX-mailws` shard.
 *
 * Deliberately never sees the user's Apple Account password — the app has no
 * business holding one, and Apple's 2FA belongs in Apple's own login UI.
 */
async function establishIcloudSession(rawSession: string) {
  if (!isIcloudWebServiceEnabled()) {
    throw new Error("The iCloud web service connection is disabled.")
  }

  const parsed = (() => {
    try {
      return parseSessionInput(rawSession)
    } catch (error) {
      if (error instanceof ICloudSessionInputError)
        throw new Error(error.message)
      throw error
    }
  })()

  const candidate = buildSession(parsed)

  const bootstrap = await discoverWebServices(candidate).catch((error) => {
    if (error instanceof ICloudReauthRequiredError) {
      throw new Error(
        "iCloud rejected that session. Sign in at icloud.com again and copy a fresh session."
      )
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : "Could not validate the iCloud session."
    )
  })

  const address = bootstrap.primaryEmail
  if (!address) {
    throw new Error("iCloud did not report an email address for that session.")
  }
  assertIcloudAddress(address)

  return {
    session: {
      ...candidate,
      dsid: bootstrap.dsid,
      mailServiceUrl: bootstrap.mailServiceUrl,
      cookies: bootstrap.refreshedCookies ?? candidate.cookies,
    },
    address,
    name: bootstrap.fullName || address.split("@")[0] || address,
  }
}

/**
 * Connects an iCloud account through Apple's Mail WebService using a captured
 * iCloud.com session instead of an app-specific password.
 *
 * If the user already has this iCloud address connected over IMAP, the existing
 * app-specific password is kept: the web service cannot send mail, and the
 * router driver falls back to SMTP for that.
 */
export async function createIcloudWebSessionConnection(rawSession: string) {
  const session = await requireSession()
  const established = await establishIcloudSession(rawSession)

  const db = await getzeitmailDB(session.user.id)
  const existing = (await db.findManyConnections()).find(
    (connection) =>
      connection.email.toLowerCase() === established.address.toLowerCase()
  )

  // (userId, email) is unique, so an existing row for this address has to be
  // reused rather than inserted alongside. Reusing one that belongs to another
  // provider would silently convert that account, so refuse instead.
  if (existing && existing.providerId !== EProviders.icloud) {
    throw new Error(
      `${established.address} is already connected as a ${existing.providerId} account. Remove it first.`
    )
  }

  if (existing) {
    await db.updateConnection(existing.id, {
      providerId: EProviders.icloud,
      name: existing.name || established.name,
      webSession: encrypt(serializeSession(established.session)),
      connectionState: "connected",
      scope: "icloud",
      expiresAt: new Date("2099-12-31"),
    })
  } else {
    await db.createConnection(EProviders.icloud, established.address, {
      name: established.name,
      picture: "",
      // No app-specific password on a session-only connection. `accessToken`
      // stays empty and the router driver skips building an IMAP client.
      accessToken: "",
      refreshToken: null as string | null,
      scope: "icloud",
      webSession: encrypt(serializeSession(established.session)),
      connectionState: "connected",
      expiresAt: new Date("2099-12-31"),
    })
  }

  await logSecurityEvent("connection_added", session.user.id, {
    providerId: "icloud",
    authMode: "webservice",
    // Cookie *names*, never values — enough to debug an auth failure, useless
    // to anyone who reads the audit log.
    session: redactSession(established.session),
  })

  return { success: true, email: established.address }
}

/**
 * Replaces the stored session on an existing iCloud connection after Apple
 * expired it. Kept separate from the create path so the UI can offer
 * "Reconnect" without the user losing folder state or signatures.
 */
export async function reconnectIcloudWebSession(
  connectionId: string,
  rawSession: string
) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const existing = await db.findUserConnection(connectionId)
  if (!existing) throw new Error("Connection not found")
  if (existing.providerId !== EProviders.icloud) {
    throw new Error("That connection is not an iCloud account.")
  }

  const established = await establishIcloudSession(rawSession)
  if (established.address.toLowerCase() !== existing.email.toLowerCase()) {
    throw new Error(
      `That session belongs to ${established.address}, not ${existing.email}.`
    )
  }

  await db.updateConnection(connectionId, {
    webSession: encrypt(serializeSession(established.session)),
    connectionState: "connected",
  })

  return { success: true }
}
