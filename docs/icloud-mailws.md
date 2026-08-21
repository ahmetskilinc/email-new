# iCloud Mail WebService (`mailws`) provider

iCloud.com's own Mail frontend does not use IMAP. It talks to an Apple HTTP
service exposed per-account as `https://pXX-mailws.icloud.com`, authenticated
by a signed-in iCloud.com session. This document covers the provider built on
top of that service: what it does, what is verified, and what to do when Apple
changes it.

**Status: experimental.** Apple documents IMAP + SMTP as the supported
protocols for third-party mail clients. `mailws` is reverse engineered and
unsupported. Treat it as a beta path, not as a public Apple Mail API.

---

## Why

IMAP gives iCloud a mailbox-shaped integration: folders, UIDs, per-connection
state, and an app-specific password the user has to mint by hand. `mailws`
gives it an API-shaped one, much closer to what the Gmail and Microsoft Graph
drivers already do — folder GUIDs, message ids, JSON payloads, and a session
rather than a password.

## What is actually implemented

```
apps/web/server/lib/transport/icloud/
  constants.ts    wire constants: origins, endpoints, build numbers, timeouts
  session.ts      the credential: parsing, cookie jar, rotation, redaction
  bootstrap.ts    service discovery — validates the session, finds the pXX shard
  client.ts       authenticated HTTP client for /wm/*
  operations.ts   the protocol: every request body and response field name
  mapper.ts       Apple's representation -> the app's ParsedMessage / Label
  errors.ts       error taxonomy and connection-state vocabulary

apps/web/server/lib/driver/
  icloud.ts             router: web service first, IMAP/SMTP fallback
  icloud-webservice.ts  MailManager over mailws
  icloud-imap.ts        MailManager over IMAP/SMTP (unchanged behaviour)
```

Nothing above `mapper.ts` knows what a folder GUID or an Apple flag is. If
Apple retires `mailws`, only this directory needs replacing.

## Authentication

The app never asks for, receives, or stores an Apple Account password. Apple's
login and two-factor flow stay in Apple's UI. The user signs in at icloud.com,
copies the session, and pastes it into the connect form.

```
Sign in at icloud.com  ->  copy the Cookie header  ->  paste into "Connect iCloud"
        -> POST setup.icloud.com/setup/ws/1/validate
        -> read dsInfo.dsid + webservices.mail.url
        -> POST https://pXX-mailws.icloud.com/wm/*
```

Accepted paste formats: a raw `Cookie:` header, a JSON object with a `cookies`
field, or a JSON array of `{name, value}` (what cookie-export extensions and
`context.cookies()` produce).

### Credential handling

The session is a signed-in iCloud.com session. It may reach more of the user's
Apple account than Mail. Accordingly:

- encrypted at rest with the same AES-256-GCM envelope as every other stored
  credential (`connection.web_session`);
- never returned to the browser — `listConnections` exposes only
  `usesWebService` and `connectionState`;
- only ever logged through `redactSession`, which emits cookie *names* and
  sizes, never values, and truncates the DSID;
- rotated in place when Apple sends `Set-Cookie`, and written straight back to
  the connection row;
- destroyed with the connection row. Apple offers no third-party revocation, so
  `revokeToken` returns `false` for this credential rather than claiming a
  revocation that did not happen — the user signs the session out at
  appleid.apple.com.

### Connection state

```ts
type ICloudConnectionState = "connected" | "expired" | "reauth_required" | "unsupported"
```

Stored on `connection.connection_state`. An Apple auth failure (401/403/421/450)
marks the connection `reauth_required`, which surfaces in settings as
*Disconnected* with a **Reconnect** button that re-imports a fresh session
without losing signatures, sync state or the default-connection setting. A
response Apple no longer serves in a shape we understand marks it `unsupported`.

## Sending

`mailws`'s compose endpoint is not part of the protocol surface this provider
relies on. Rather than guess at a payload that sends mail on the user's behalf,
`create`, `sendDraft` and `createDraft` raise
`ICloudUnsupportedOperationError`, and the router driver falls back to SMTP when
the connection still holds an app-specific password. A session-only connection
reports a clear error instead of silently losing an email.

This is why the connect dialog keeps both modes, and why connecting a session
for an address that already has an app password preserves the password.

## Verified vs. unverified

| Layer | Status |
| --- | --- |
| Session parsing, cookie jar, rotation, redaction | Unit tested |
| Bootstrap response reading, service-URL validation | Unit tested |
| Client query params, headers, auth/protocol/transport error mapping | Unit tested against a stubbed `fetch` |
| Response readers (folders, messages, attachments, dates) | Unit tested against representative payloads |
| Apple ↔ app mapping (labels, threads, ParsedMessage) | Unit tested |
| **`/wm/*` request bodies in `WM_REQUESTS`** | **Not verified against a live account** |

The endpoints (`POST /wm/folder`, `POST /wm/message`) are long-established. The
exact request field names are not: they have to be re-derived from the current
iCloud.com frontend. `WM_REQUESTS` in `operations.ts` is the single place they
live, and response reading is deliberately tolerant — several candidate keys
per field, every field optional — so a rename on Apple's side degrades one
field rather than breaking the mailbox.

## Capture procedure

Run this against a test account before enabling the provider for real users,
and again whenever Apple's build number changes:

1. Sign in at `icloud.com` and open Mail.
2. Open DevTools → Network, filter for `mailws` or `/wm/`.
3. Perform each operation and record the request URL, body, and response:
   open the Inbox, open a message, mark it unread, star it, move it, archive
   it, delete it, empty Junk, create/rename/delete a folder.
4. Note the `clientBuildNumber` and `clientMasteringNumber` on the requests.
5. Correct `WM_REQUESTS` and, if needed, the candidate key lists in the
   response readers. Update `DEFAULT_CLIENT_BUILD_NUMBER` in `constants.ts`.

Operation → endpoint map to fill in from the capture:

```
List folders        POST /wm/folder
List messages       POST /wm/message
Read message        POST /wm/message
Mark read/unread    <confirm>
Star                <confirm>
Move / archive      <confirm>
Delete              <confirm>
Empty Junk          <confirm>
Send                <not implemented — falls back to SMTP>
```

## Configuration

```
ICLOUD_WEBSERVICE_ENABLED=true   # default; "false" hides the session flow
```

With the flag off, the connect dialog offers only the app-specific password
form. Existing connections are unaffected either way — the router picks its
path from what the connection actually stores.

## Database

Two nullable columns on `zeitmail_connection`:

- `web_session` — encrypted session JSON. NULL means this connection is IMAP.
- `connection_state` — NULL or `"connected"` means healthy.

Both are additive; existing rows keep working untouched. Apply with
`bun run db:push` (or `db:generate` + `db:migrate`).

## Known limitations

- Sending and draft-saving require an app-specific password (see above).
- Threading uses Apple's conversation id when one is present, and falls back to
  one thread per message otherwise.
- `listHistory` polls: it compares message dates against the last seen
  timestamp. Apple's push service (`pXX-pushws.icloud.com` → `/getToken` →
  `webcourier.push.apple.com`) would remove the polling, but its current
  protocol needs its own capture first.
- Attachment bodies come back inline with the message payload; very large
  attachments have not been exercised.
- Apple may change endpoints, payloads, build-number requirements, cookies or
  rate limits without notice. Automated integration tests against a controlled
  account are the only way to notice promptly.

## Legal

Using Apple's private web APIs in a commercial product may carry contractual or
App Store implications. That needs a review before this ships to real users;
this document is not one.
