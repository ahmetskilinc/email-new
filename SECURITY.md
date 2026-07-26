# Security Policy

## Reporting a vulnerability

Please report security issues privately via [GitHub Security
Advisories](https://github.com/ahmetskilinc/email-new/security/advisories/new)
rather than opening a public issue.

Include what you need to make the issue reproducible: affected version or
commit, the request or message that triggers it, and what an attacker gains. If
the finding involves a crafted email, attach the raw `.eml` where possible.

We aim to acknowledge within 3 business days and to ship a fix or a mitigation
plan within 30 days for anything rated high or critical.

Please do not test against accounts or mailboxes you do not own.

## What this application handles

This is an email client, so a compromise is unusually costly: the database holds
IMAP/SMTP app passwords and OAuth refresh tokens granting full, offline access
to users' mailboxes. Treat anything touching the following as security-relevant:

- `server/lib/encryption.ts` and credential storage in `server/db/schema.ts`
- `server/lib/email-processor.ts` and `components/mail/mail-content.tsx` —
  message HTML is attacker-controlled and renders in a sandboxed iframe
- `server/lib/transport/host-validation.ts` — user-supplied mail server hosts
- `server/lib/auth.ts` and `proxy.ts`
- Anything in `server/actions/` — every exported function is a public endpoint

## Expectations for contributors

- Every exported function in `server/actions/` is callable by any logged-in user
  with arbitrary arguments. Authenticate with `requireSession()` /
  `requireActiveDriver()` and scope every query through `getzeitmailDB(userId)`.
- Never render message or event HTML outside the sandboxed iframe, and never
  mutate HTML after sanitizing it — re-sanitize if you must post-process.
- Never return a raw error to the client from a path that touches a
  user-supplied host; use `safeError()`.
- Never log credentials, tokens, message bodies, or recipient addresses.
- Bound anything sized by the client (see `server/lib/limits.ts`).

## Known gaps

Tracked, not yet implemented:

- No MFA, and no transactional email channel, so email verification and password
  reset are unavailable. `requireEmailVerification` is off for that reason.
- No sender authentication surfaced in the UI (SPF/DKIM/DMARC results are not
  parsed), and BIMI logos are not gated on a DMARC pass.
- No malware or attachment-type scanning.
- `ENCRYPTION_KEY` has no rotation tooling. The ciphertext envelope is versioned
  (`v1.`) so a rotation path can be added without ambiguity.
