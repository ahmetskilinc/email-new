import { type Account, betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getSocialProviders } from "./auth-providers"
import { defaultUserSettings } from "./schemas"
import { getzeitmailDB } from "./server-utils"
import { type EProviders } from "../types"
import { createDriver } from "./driver"
import { createDb } from "../db"
import { env } from "../env"

const connectionHandlerHook = async (account: Account) => {
  try {
    if (!account.accessToken) return

    let refreshToken = account.refreshToken
    if (!refreshToken) {
      const db = await getzeitmailDB(account.userId)
      const connections = await db.findManyConnections()
      const existing = connections.find(
        (c) => c.providerId === account.providerId,
      )
      refreshToken = existing?.refreshToken ?? null
    }

    if (!refreshToken) return

    const driver = createDriver(account.providerId, {
      auth: {
        accessToken: account.accessToken,
        refreshToken,
        userId: account.userId,
        email: "",
      },
    })

    const userInfo = await driver.getUserInfo().catch(() => null)
    if (!userInfo?.address) return

    const db = await getzeitmailDB(account.userId)
    const [result] = await db.createConnection(
      account.providerId as EProviders,
      userInfo.address,
      {
        name: userInfo.name || "Unknown",
        picture: userInfo.photo || "",
        accessToken: account.accessToken,
        refreshToken,
        scope: driver.getScope(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    )

    const userData = await db.findUser()
    if (result?.id && !userData?.defaultConnectionId) {
      await db.updateUser({ defaultConnectionId: result.id })
    }
  } catch (error) {
    console.error("[connectionHandlerHook] error:", error)
  }
}

const createAuthConfig = () => {
  const { db } = createDb(env.DATABASE_URL)
  return {
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    advanced: {
      ipAddress: {
        disableIpTracking: true,
      },
      cookiePrefix:
        env.NODE_ENV === "development" ? "better-auth-dev" : "better-auth",
    },
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      ...(env.BETTER_AUTH_TRUSTED_ORIGINS
        ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : []),
    ],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 30,
      },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24 * 3,
    },
    socialProviders: getSocialProviders(env as unknown as Record<string, string>),
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        trustedProviders: ["google", "microsoft"],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    onAPIError: {
      onError: (error: any) => {
        console.error("[Better Auth] API Error:", error)
      },
      errorURL: "/login",
      throw: true,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              const db = await getzeitmailDB(user.id)
              const existingSettings = await db.findUserSettings()
              if (!existingSettings) {
                await db.insertUserSettings({ ...defaultUserSettings })
              }
            } catch (error) {
              console.error(
                "[user.create hook] Failed to insert default settings:",
                error,
              )
            }
          },
        },
      },
      account: {
        create: {
          after: connectionHandlerHook,
        },
        update: {
          after: connectionHandlerHook,
        },
      },
    },
  } satisfies BetterAuthOptions
}

export const auth = betterAuth(createAuthConfig())

export type Auth = typeof auth
