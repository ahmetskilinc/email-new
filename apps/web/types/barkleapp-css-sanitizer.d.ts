/**
 * `@barkleapp/css-sanitizer` ships no type declarations, which is why
 * email-processor.ts carried a blanket `// @ts-nocheck`. Declaring the surface
 * we use lets that file be type-checked like the rest of the server code.
 *
 * Note: this library is defence-in-depth only, not a security boundary — it
 * merges its own permissive defaults into `allowedProperties` rather than
 * replacing them, and emits at-rule bodies verbatim. Containment comes from the
 * sandboxed iframe and its CSP in components/mail/mail-content.tsx.
 */
declare module "@barkleapp/css-sanitizer" {
  export interface CssSanitizerConfig {
    maxCssLength?: number
    allowedProperties?: Set<string> | string[]
    allowedAtRules?: Set<string> | string[]
    allowedPseudoClasses?: Set<string> | string[]
    validateUrl?: (url: string) => boolean
    sanitizeUrl?: (url: string) => string
  }

  export class CssSanitizer {
    constructor(config?: CssSanitizerConfig)
    sanitizeCss(css: string): string
  }
}
