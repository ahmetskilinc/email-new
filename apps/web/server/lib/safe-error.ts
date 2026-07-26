import { randomUUID } from "node:crypto"

/**
 * Logs an error server-side and returns an opaque message for the client.
 *
 * Next.js redacts errors *thrown* out of a server action, but several paths here
 * return the error inside the response value instead, which defeats that. Raw
 * socket and IMAP/SMTP errors ("connect ECONNREFUSED 10.0.3.14:6379",
 * "getaddrinfo ENOTFOUND vault.internal.corp") turn a blind SSRF into a full
 * read oracle delivered straight to the caller's browser.
 *
 * The correlation id lets an operator find the real error in the logs.
 */
export function safeError(
  scope: string,
  error: unknown,
  clientMessage = "Something went wrong. Please try again."
): { message: string; correlationId: string } {
  const correlationId = randomUUID()
  console.error(
    `[${scope}] ${correlationId}:`,
    error instanceof Error ? (error.stack ?? error.message) : error
  )
  return { message: `${clientMessage} (ref: ${correlationId})`, correlationId }
}
