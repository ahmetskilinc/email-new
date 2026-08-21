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
import { EProviders } from "../types"

export async function listConnections() {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const connections = await db.findManyConnections()

  const appPasswordProviders = ["icloud", "yahoo", "custom"]
  const disconnectedIds = connections
    .filter(
      (c) =>
        !c.accessToken ||
        (!appPasswordProviders.includes(c.providerId) && !c.refreshToken)
    )
    .map((c) => c.id)

  return {
    connections: connections.map((connection) => ({
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
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
