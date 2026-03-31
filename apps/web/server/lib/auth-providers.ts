export interface ProviderConfig {
  id: string
  name: string
  requiredEnvVars: string[]
  config: unknown
  required?: boolean
}

export const authProviders = (env: Record<string, string>): ProviderConfig[] => [
  {
    id: "google",
    name: "Google",
    requiredEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    config: {
      prompt: "consent",
      accessType: "offline",
      scope: [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    required: true,
  },
  {
    id: "microsoft",
    name: "Microsoft",
    requiredEnvVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    config: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: "common",
      scope: [
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Mail.ReadWrite",
        "https://graph.microsoft.com/Mail.Send",
        "https://graph.microsoft.com/Calendars.Read",
        "offline_access",
      ],
      prompt: "consent",
    },
    required: false,
  },
]

export function isProviderEnabled(
  provider: ProviderConfig,
  env: Record<string, string>,
): boolean {
  const hasEnvVars = provider.requiredEnvVars.every((envVar) => !!env[envVar])

  if (provider.required && !hasEnvVars) {
    console.error(
      `Required provider "${provider.id}" is not configured properly.`,
    )
    console.error(
      `Missing environment variables: ${provider.requiredEnvVars.filter((envVar) => !env[envVar]).join(", ")}`,
    )
  }

  return hasEnvVars
}

export function getSocialProviders(env: Record<string, string>) {
  const socialProviders = Object.fromEntries(
    authProviders(env)
      .map((provider) => {
        if (isProviderEnabled(provider, env)) {
          return [provider.id, provider.config] as [string, unknown]
        }
        if (provider.required) {
          console.warn(
            `Required provider "${provider.id}" is not configured. OAuth login for this provider will not work.`,
          )
        }
        return null
      })
      .filter((provider) => provider !== null),
  )
  return socialProviders
}
