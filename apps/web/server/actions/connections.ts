"use server"

import { requireSession } from "../lib/session"
import {
  getActiveConnection,
  getzeitmailDB,
} from "../lib/server-utils"
import { createDriver } from "../lib/driver"
import { encrypt } from "../lib/encryption"
import { EProviders } from "../types"

export async function listConnections() {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const connections = await db.findManyConnections()

  const appPasswordProviders = ["icloud", "yahoo"]
  const disconnectedIds = connections
    .filter(
      (c) =>
        !c.accessToken ||
        (!appPasswordProviders.includes(c.providerId) && !c.refreshToken),
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
  await db.deleteConnection(connectionId)

  const activeConnection = await getActiveConnection(session.user.id).catch(
    () => null,
  )
  if (connectionId === activeConnection?.id) {
    await db.updateUser({ defaultConnectionId: null })
  }
}

export async function getDefaultConnection() {
  try {
    const session = await requireSession()
    const connection = await getActiveConnection(session.user.id).catch(
      () => null,
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

export async function createIcloudConnection(
  email: string,
  password: string,
) {
  const session = await requireSession()

  const validDomains = ["icloud.com", "me.com", "mac.com"]
  const domain = email.split("@")[1]
  if (!domain || !validDomains.includes(domain)) {
    throw new Error(
      "Only iCloud email addresses are supported (icloud.com, me.com, mac.com)",
    )
  }

  const driver = createDriver(EProviders.icloud, {
    auth: {
      userId: session.user.id,
      accessToken: password,
      refreshToken: "",
      email,
    },
  })

  const userInfo = await driver.getUserInfo().catch(() => {
    throw new Error(
      "Invalid iCloud credentials. Please check your email and app-specific password.",
    )
  })

  const db = await getzeitmailDB(session.user.id)
  await db.createConnection(EProviders.icloud, userInfo.address, {
    name: userInfo.name || email.split("@")[0],
    picture: "",
    accessToken: encrypt(password),
    refreshToken: null as string | null,
    scope: "icloud",
    expiresAt: new Date("2099-12-31"),
  })

  return { success: true }
}

export async function createYahooConnection(
  email: string,
  password: string,
) {
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
        domain.toLowerCase() === d ||
        domain.toLowerCase().startsWith("yahoo."),
    )
  ) {
    throw new Error(
      "Only Yahoo email addresses are supported (yahoo.com, ymail.com, rocketmail.com, etc.)",
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
      "Invalid Yahoo credentials. Please check your email and app password.",
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

  return { success: true }
}
