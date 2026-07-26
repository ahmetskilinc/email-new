import { type Account, betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import * as schema from "../db/schema"
import { getSocialProviders } from "./auth-providers"
import { defaultUserSettings } from "./schemas"
import { getzeitmailDB, resolveRefreshToken } from "./server-utils"
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
        (c) => c.providerId === account.providerId
      )
      // Stored refresh tokens are encrypted at rest; decrypt before reuse.
      refreshToken = existing ? resolveRefreshToken(existing) || null : null
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
      }
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
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      ...(env.BETTER_AUTH_TRUSTED_ORIGINS
        ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : []),
      // Deliberately no "https://*.vercel.app": that wildcard trusts every
      // deployment on the platform, so anyone could host an origin trusted for
      // auth callbacks and CSRF. Preview URLs belong in
      // BETTER_AUTH_TRUSTED_ORIGINS, listed explicitly.
    ],
    advanced: {
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 300, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/forget-password": { window: 3600, max: 5 },
        "/reset-password": { window: 3600, max: 5 },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        // Short: a revoked session stays usable for this long. Five minutes was
        // long enough that "sign out everywhere" did not mean much.
        maxAge: 60,
      },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24 * 3,
      freshAge: 60 * 15,
    },
    socialProviders: getSocialProviders(
      env as unknown as Record<string, string>
    ),
    account: {
      accountLinking: {
        enabled: true,
        // Implicit linking is what allows a pre-registered local account to
        // absorb a later OAuth sign-in for the same address: with open signup
        // and no email verification, an attacker could register victim@… first
        // and have the victim's Google identity linked onto their row. Linking
        // now requires an explicit, authenticated link action.
        disableImplicitLinking: true,
        // allowDifferentEmails removed: nothing in this app needs an OAuth
        // identity to attach to an account with a different address.
        trustedProviders: ["google", "microsoft"],
      },
    },
    user: {
      additionalFields: {
        defaultConnectionId: {
          type: "string",
          required: false,
          input: false,
        },
        customPrompt: {
          type: "string",
          required: false,
        },
        phoneNumber: {
          type: "string",
          required: false,
          input: false,
        },
        phoneNumberVerified: {
          type: "boolean",
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Still false: this app has no transactional email channel configured, so
      // requiring verification would lock every new user out. The account
      // takeover it would otherwise mitigate is closed by disableImplicitLinking
      // above. Turn this on as soon as a mail provider is wired up.
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 256,
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
                error
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
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions
}

export const auth = betterAuth(createAuthConfig())

export type Auth = typeof auth
