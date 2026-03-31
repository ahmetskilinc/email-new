"use client"

import { processEmailContent } from "@/server/actions/mail"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSettings } from "@/hooks/use-settings"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"

interface MailContentProps {
  id: string
  html: string
  senderEmail: string
}

export function MailContent({ id, html, senderEmail }: MailContentProps) {
  const { data } = useSettings()
  const { resolvedTheme } = useTheme()

  const isTrustedSender = useMemo(
    () =>
      data?.settings?.externalImages ||
      data?.settings?.trustedSenders?.includes(senderEmail),
    [data?.settings, senderEmail]
  )

  const [cspViolation, setCspViolation] = useState(false)
  const [temporaryImagesEnabled, setTemporaryImagesEnabled] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const shadowRootRef = useRef<ShadowRoot | null>(null)

  const { data: processedData } = useQuery({
    queryKey: [
      "email-content",
      id,
      isTrustedSender || temporaryImagesEnabled,
      resolvedTheme,
    ],
    queryFn: async () => {
      const result = await processEmailContent(
        html,
        !!(isTrustedSender || temporaryImagesEnabled),
        (resolvedTheme as "light" | "dark") || "light"
      )
      return {
        html: result.processedHtml,
        hasBlockedImages: result.hasBlockedImages,
      }
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  useEffect(() => {
    if (processedData?.hasBlockedImages) {
      setCspViolation(true)
    }
  }, [processedData])

  useEffect(() => {
    if (!hostRef.current || shadowRootRef.current) return
    shadowRootRef.current = hostRef.current.attachShadow({ mode: "open" })
  }, [])

  useEffect(() => {
    if (!shadowRootRef.current || !processedData) return
    shadowRootRef.current.innerHTML = processedData.html
  }, [processedData])

  const handleImageError = useCallback(
    (e: Event) => {
      const target = e.target as HTMLImageElement
      if (target.tagName === "IMG") {
        if (!(isTrustedSender || temporaryImagesEnabled)) {
          setCspViolation(true)
        }
        target.style.display = "none"
      }
    },
    [isTrustedSender, temporaryImagesEnabled]
  )

  useEffect(() => {
    if (!shadowRootRef.current) return
    const root = shadowRootRef.current

    root.addEventListener("error", handleImageError, true)

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName === "A") {
        e.preventDefault()
        const href = target.getAttribute("href")
        if (
          href &&
          (href.startsWith("http://") || href.startsWith("https://"))
        ) {
          window.open(href, "_blank", "noopener,noreferrer")
        } else if (href && href.startsWith("mailto:")) {
          window.location.href = href
        }
      }
    }

    root.addEventListener("click", handleClick)

    return () => {
      root.removeEventListener("error", handleImageError, true)
      root.removeEventListener("click", handleClick)
    }
  }, [processedData, handleImageError])

  useEffect(() => {
    if (isTrustedSender || temporaryImagesEnabled) {
      setCspViolation(false)
    }
  }, [isTrustedSender, temporaryImagesEnabled])

  return (
    <>
      {cspViolation && !isTrustedSender && !data?.settings?.externalImages && (
        <div className="flex items-center justify-start bg-amber-600/20 px-2 py-1 text-sm text-amber-600">
          <p>Images are hidden by default for security reasons.</p>
          <button
            onClick={() => setTemporaryImagesEnabled(!temporaryImagesEnabled)}
            className="ml-2 cursor-pointer underline"
          >
            {temporaryImagesEnabled ? "Hide Images" : "Show Images"}
          </button>
        </div>
      )}
      <div ref={hostRef} className="w-full" />
    </>
  )
}
