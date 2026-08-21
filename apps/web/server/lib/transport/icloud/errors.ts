/**
 * Error and state vocabulary for the iCloud Mail WebService (`mailws`) provider.
 *
 * `mailws` is Apple's private web-mail backend — the one iCloud.com's own Mail
 * frontend talks to. It is not a documented developer API, so every failure
 * mode has to be modelled explicitly rather than assumed away: Apple can change
 * payloads, retire endpoints, or invalidate a captured session at any time.
 */

/**
 * Lifecycle of an iCloud web-session connection.
 *
 * - `connected`        session works, mailws answering normally
 * - `expired`          Apple rejected the session; a refresh may still succeed
 * - `reauth_required`  the user must sign in to iCloud.com again and re-import
 * - `unsupported`      the protocol moved out from under us; fall back to IMAP
 */
export type ICloudConnectionState =
  | "connected"
  | "expired"
  | "reauth_required"
  | "unsupported"

export class ICloudWebServiceError extends Error {
  public readonly status?: number
  public readonly endpoint?: string

  constructor(
    message: string,
    options: { status?: number; endpoint?: string; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = "ICloudWebServiceError"
    this.status = options.status
    this.endpoint = options.endpoint
  }
}

/**
 * The stored session no longer authenticates. Callers must not retry with the
 * same credential: the connection has to be marked `reauth_required` and the
 * user sent back through the iCloud.com sign-in flow.
 */
export class ICloudReauthRequiredError extends ICloudWebServiceError {
  constructor(
    message = "iCloud session expired. Reconnect your iCloud account.",
    options: { status?: number; endpoint?: string; cause?: unknown } = {}
  ) {
    super(message, options)
    this.name = "ICloudReauthRequiredError"
  }
}

/**
 * The operation has no mapping onto the mailws surface we know about (send is
 * the main one — Apple's compose endpoint is not part of the captured
 * protocol). The router driver catches this and falls back to IMAP/SMTP when
 * the connection also carries an app-specific password.
 */
export class ICloudUnsupportedOperationError extends ICloudWebServiceError {
  public readonly operation: string

  constructor(operation: string, message?: string) {
    super(
      message ??
        `Operation "${operation}" is not available over the iCloud Mail WebService.`
    )
    this.name = "ICloudUnsupportedOperationError"
    this.operation = operation
  }
}

/**
 * mailws answered, but not in a shape this client understands — the signal that
 * Apple changed the protocol. Distinct from a transport failure so that
 * monitoring can tell "Apple is down" from "Apple moved".
 */
export class ICloudProtocolError extends ICloudWebServiceError {
  constructor(
    message: string,
    options: { endpoint?: string; cause?: unknown } = {}
  ) {
    super(message, options)
    this.name = "ICloudProtocolError"
  }
}

export function isReauthRequired(error: unknown): boolean {
  return error instanceof ICloudReauthRequiredError
}

export function isUnsupportedOperation(error: unknown): boolean {
  return error instanceof ICloudUnsupportedOperationError
}
