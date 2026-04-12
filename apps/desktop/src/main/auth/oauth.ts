import { ipcMain, shell } from "electron"
import { OAuth2Client } from "google-auth-library"
import http from "node:http"
import https from "node:https"
import { URL, URLSearchParams } from "node:url"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

// ---------------------------------------------------------------------------
// Google OAuth  (loopback redirect)
// ---------------------------------------------------------------------------

const GOOGLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/contacts.readonly",
]

export async function startGoogleOAuth(
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    // 1. Start a temp HTTP server on a random port
    const server = http.createServer()

    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        return reject(new Error("Failed to start loopback server"))
      }

      const port = address.port
      const redirectUri = `http://127.0.0.1:${port}/callback`

      const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)

      // 2. Generate auth URL and open in browser
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: GOOGLE_SCOPES,
        prompt: "consent",
      })

      shell.openExternal(authUrl)

      // 3. Handle the callback
      server.on("request", async (req, res) => {
        try {
          if (!req.url?.startsWith("/callback")) {
            res.writeHead(404)
            res.end("Not found")
            return
          }

          const url = new URL(req.url, `http://127.0.0.1:${port}`)
          const code = url.searchParams.get("code")
          const error = url.searchParams.get("error")

          if (error) {
            res.writeHead(200, { "Content-Type": "text/html" })
            res.end(
              "<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>",
            )
            server.close()
            return reject(new Error(`Google OAuth error: ${error}`))
          }

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" })
            res.end(
              "<html><body><h2>Missing authorization code</h2><p>You can close this window.</p></body></html>",
            )
            server.close()
            return reject(new Error("No authorization code received"))
          }

          // 4. Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code)

          res.writeHead(200, { "Content-Type": "text/html" })
          res.end(
            "<html><body><h2>Authentication successful!</h2><p>You can close this window and return to the app.</p></body></html>",
          )

          // 5. Shut down temp server
          server.close()

          // 6. Return tokens
          const expiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : new Date(Date.now() + 3600 * 1000).toISOString()

          resolve({
            accessToken: tokens.access_token ?? "",
            refreshToken: tokens.refresh_token ?? "",
            expiresAt,
          })
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" })
          res.end(
            "<html><body><h2>Something went wrong</h2><p>You can close this window.</p></body></html>",
          )
          server.close()
          reject(err)
        }
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close()
        reject(new Error("Google OAuth timed out"))
      }, 5 * 60 * 1000)
    })

    server.on("error", (err) => {
      reject(err)
    })
  })
}

// ---------------------------------------------------------------------------
// Microsoft OAuth  (custom protocol redirect)
// ---------------------------------------------------------------------------

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Calendars.ReadWrite",
  "https://graph.microsoft.com/Contacts.Read",
]

const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common"
const MICROSOFT_TOKEN_ENDPOINT = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`
const MICROSOFT_AUTH_ENDPOINT = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize`
const MICROSOFT_REDIRECT_URI = "zeitmail://auth/microsoft/callback"

let pendingMicrosoftResolve: ((tokens: OAuthTokens) => void) | null = null
let pendingMicrosoftReject: ((err: Error) => void) | null = null
let microsoftClientId: string | null = null
let microsoftClientSecret: string | null = null

/**
 * Called from the main process when a zeitmail:// deep link is received.
 */
export function handleMicrosoftProtocolCallback(url: string): void {
  if (!pendingMicrosoftResolve || !pendingMicrosoftReject) {
    return
  }

  const resolve = pendingMicrosoftResolve
  const reject = pendingMicrosoftReject
  pendingMicrosoftResolve = null
  pendingMicrosoftReject = null

  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get("code")
    const error = parsed.searchParams.get("error")

    if (error) {
      const description = parsed.searchParams.get("error_description") ?? error
      reject(new Error(`Microsoft OAuth error: ${description}`))
      return
    }

    if (!code) {
      reject(new Error("No authorization code received from Microsoft"))
      return
    }

    // Exchange code for tokens
    exchangeMicrosoftCode(code)
      .then(resolve)
      .catch(reject)
  } catch (err) {
    reject(err instanceof Error ? err : new Error(String(err)))
  }
}

function exchangeMicrosoftCode(code: string): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: microsoftClientId!,
      client_secret: microsoftClientSecret!,
      code,
      redirect_uri: MICROSOFT_REDIRECT_URI,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }).toString()

    const url = new URL(MICROSOFT_TOKEN_ENDPOINT)

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on("end", () => {
          try {
            const json = JSON.parse(data) as {
              access_token?: string
              refresh_token?: string
              expires_in?: number
              error?: string
              error_description?: string
            }

            if (json.error) {
              reject(
                new Error(
                  `Microsoft token error: ${json.error_description ?? json.error}`,
                ),
              )
              return
            }

            const expiresAt = new Date(
              Date.now() + (json.expires_in ?? 3600) * 1000,
            ).toISOString()

            resolve({
              accessToken: json.access_token ?? "",
              refreshToken: json.refresh_token ?? "",
              expiresAt,
            })
          } catch (err) {
            reject(
              err instanceof Error
                ? err
                : new Error("Failed to parse Microsoft token response"),
            )
          }
        })
      },
    )

    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

export async function startMicrosoftOAuth(
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokens> {
  // Store credentials for the token exchange
  microsoftClientId = clientId
  microsoftClientSecret = clientSecret

  return new Promise((resolve, reject) => {
    pendingMicrosoftResolve = resolve
    pendingMicrosoftReject = reject

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: MICROSOFT_REDIRECT_URI,
      scope: MICROSOFT_SCOPES.join(" "),
      response_mode: "query",
      prompt: "consent",
    })

    const authUrl = `${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`
    shell.openExternal(authUrl)

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingMicrosoftResolve) {
        pendingMicrosoftResolve = null
        pendingMicrosoftReject = null
        reject(new Error("Microsoft OAuth timed out"))
      }
    }, 5 * 60 * 1000)
  })
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

export function registerOAuthHandlers(): void {
  ipcMain.handle(
    "auth:startGoogleOAuth",
    async (_e, clientId: string, clientSecret: string) => {
      return startGoogleOAuth(clientId, clientSecret)
    },
  )

  ipcMain.handle(
    "auth:startMicrosoftOAuth",
    async (_e, clientId: string, clientSecret: string) => {
      return startMicrosoftOAuth(clientId, clientSecret)
    },
  )
}
