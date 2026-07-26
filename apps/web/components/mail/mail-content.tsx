"use client"

import { processEmailContent } from "@/server/actions/mail"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSettings } from "@/hooks/use-settings"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"

interface MailContentProps {
  id: string
  html: string
  senderEmail: string
}

/**
 * Builds the document loaded into the sandboxed frame.
 *
 * Two layers of containment, because message HTML is fully attacker-controlled:
 *
 *  1. The iframe is sandboxed WITHOUT `allow-same-origin`, so the document gets
 *     an opaque origin. Even if the sanitizer is bypassed, the content cannot
 *     reach the app's DOM, cookies, storage, or same-origin endpoints. This is
 *     what the previous open shadow root — same origin, full access — did not do.
 *  2. A document CSP inside the frame. `script-src 'nonce-…'` lets the small
 *     trusted bootstrap below run while blocking any injected script that
 *     survived sanitization, and when remote images are disabled `img-src`/
 *     `font-src` are 'none', so tracking pixels are stopped by the browser
 *     rather than by rewriting markup — including the `url()` loads in attacker
 *     CSS that DOM-level image blocking never caught.
 *
 * `allow-scripts` is required for the bootstrap to report content height back to
 * the parent; combined with the nonce CSP it grants attacker markup nothing.
 */
function buildFrameDocument(
  bodyHtml: string,
  nonce: string,
  imagesEnabled: boolean
): string {
  const imgSrc = imagesEnabled ? "http: https: data:" : "'none'"
  const fontSrc = imagesEnabled ? "data: https:" : "'none'"
  const csp = [
    `default-src 'none'`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `style-src 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `form-action 'none'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'none'`,
  ].join("; ")

  return `<!doctype html>
<html><head>
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
${bodyHtml}
<script nonce="${nonce}">
(function () {
  var post = function (msg) { parent.postMessage(Object.assign({ __mail: 1 }, msg), '*') }
  var report = function () {
    var d = document.documentElement, b = document.body
    post({ type: 'height', height: Math.max(b.scrollHeight, d.scrollHeight, b.offsetHeight) })
  }
  window.addEventListener('load', report)
  document.addEventListener('DOMContentLoaded', report)
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body)
  setTimeout(report, 50); setTimeout(report, 500)

  // Links are handed to the parent, which validates the scheme and opens them.
  document.addEventListener('click', function (e) {
    var el = e.target
    while (el && el.tagName !== 'A') el = el.parentElement
    if (!el) return
    e.preventDefault()
    post({ type: 'link', href: el.getAttribute('href') || '' })
  })

  document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') post({ type: 'imageBlocked' })
  }, true)
})()
</script>
</body></html>`
}

export function MailContent({ id, html, senderEmail }: MailContentProps) {
  const { data } = useSettings()
  const { resolvedTheme } = useTheme()

  const settings = data?.settings
  const isTrustedSender = useMemo(
    () =>
      !!(
        settings?.externalImages ||
        settings?.trustedSenders?.includes(senderEmail)
      ),
    [settings, senderEmail]
  )

  const [blockedImagesNotice, setBlockedImagesNotice] = useState(false)
  const [temporaryImagesEnabled, setTemporaryImagesEnabled] = useState(false)
  const [frameHeight, setFrameHeight] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const imagesEnabled = isTrustedSender || temporaryImagesEnabled

  const { data: processedData } = useQuery({
    queryKey: ["email-content", id, imagesEnabled, resolvedTheme],
    queryFn: async () => {
      const result = await processEmailContent(
        html,
        imagesEnabled,
        (resolvedTheme as "light" | "dark") || "light"
      )
      return {
        html: result.processedHtml,
        hasBlockedImages: result.hasBlockedImages,
      }
    },
    // Settings decide whether remote images load. Running before they resolve
    // would render the message under the wrong policy and cache that result.
    enabled: settings !== undefined,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  // Regenerated per render of a new body so a nonce is never reused.
  const nonce = useMemo(
    () => crypto.randomUUID().replace(/-/g, ""),
    [processedData?.html, imagesEnabled]
  )

  const srcDoc = useMemo(
    () =>
      processedData
        ? buildFrameDocument(processedData.html, nonce, imagesEnabled)
        : null,
    [processedData, nonce, imagesEnabled]
  )

  useEffect(() => {
    if (processedData?.hasBlockedImages) setBlockedImagesNotice(true)
  }, [processedData])

  useEffect(() => {
    if (imagesEnabled) setBlockedImagesNotice(false)
  }, [imagesEnabled])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Opaque-origin frames post with origin "null", so identify the sender by
      // its window handle rather than by origin.
      if (
        !frameRef.current ||
        event.source !== frameRef.current.contentWindow ||
        !event.data ||
        event.data.__mail !== 1
      ) {
        return
      }

      const msg = event.data as {
        type?: string
        height?: number
        href?: string
      }

      if (msg.type === "height" && typeof msg.height === "number") {
        setFrameHeight(Math.min(Math.max(msg.height, 0), 20000))
        return
      }

      if (msg.type === "imageBlocked") {
        if (!imagesEnabled) setBlockedImagesNotice(true)
        return
      }

      if (msg.type === "link" && typeof msg.href === "string") {
        let url: URL
        try {
          url = new URL(msg.href, "about:blank")
        } catch {
          return
        }
        if (url.protocol === "http:" || url.protocol === "https:") {
          window.open(url.href, "_blank", "noopener,noreferrer")
        } else if (url.protocol === "mailto:") {
          window.location.href = url.href
        }
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [imagesEnabled])

  return (
    <>
      {blockedImagesNotice && !imagesEnabled && (
        <div className="flex items-center justify-start bg-bruv-warn-subtle px-2 py-1 text-sm text-bruv-warn">
          <p>Images are hidden by default for security reasons.</p>
          <button
            onClick={() => setTemporaryImagesEnabled(!temporaryImagesEnabled)}
            className="ml-2 cursor-pointer underline"
          >
            {temporaryImagesEnabled ? "Hide Images" : "Show Images"}
          </button>
        </div>
      )}
      {srcDoc && (
        <iframe
          ref={frameRef}
          // No allow-same-origin: the frame runs in an opaque origin and cannot
          // reach the app. No allow-popups/-forms/-top-navigation either.
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          title="Message content"
          className="w-full border-0"
          style={{ height: frameHeight ? `${frameHeight}px` : "auto" }}
        />
      )}
    </>
  )
}
