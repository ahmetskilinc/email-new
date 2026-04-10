"use client"

import { useCallback, useMemo } from "react"
import { useThread } from "@/hooks/use-threads"
import { useEmailAliases } from "@/hooks/use-email-aliases"
import { useOpenCompose } from "@/store/compose"
import type { ParsedMessage } from "@/server/types"

function buildQuotedHtml(message: ParsedMessage): string {
  const date = message.receivedOn
    ? new Date(message.receivedOn).toLocaleString()
    : ""
  const from = message.sender?.name
    ? `${message.sender.name} &lt;${message.sender.email}&gt;`
    : (message.sender?.email ?? "")

  return `<br/><br/><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666"><p>On ${date}, ${from} wrote:</p>${message.decodedBody ?? ""}</div>`
}

function buildReplyHeaders(message: ParsedMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  if (message.messageId) {
    headers["In-Reply-To"] = message.messageId
    const existingRefs = message.references ?? ""
    headers["References"] = `${existingRefs} ${message.messageId}`.trim()
  }
  return headers
}

export function useReplyActions(threadId: string | null) {
  const { data } = useThread(threadId)
  const { data: aliases } = useEmailAliases()
  const openCompose = useOpenCompose()

  const myEmails = useMemo(() => {
    if (!aliases) return new Set<string>()
    return new Set(aliases.map((a: { email: string }) => a.email.toLowerCase()))
  }, [aliases])

  const latestMessage = useMemo(() => {
    if (!data?.messages?.length) return null
    return data.messages[data.messages.length - 1]!
  }, [data?.messages])

  const handleReply = useCallback(() => {
    if (!latestMessage) return
    const subject = latestMessage.subject?.startsWith("Re:")
      ? latestMessage.subject
      : `Re: ${latestMessage.subject ?? ""}`

    const replyTo = latestMessage.replyTo || latestMessage.sender?.email || ""

    openCompose({
      to: [replyTo],
      subject,
      message: buildQuotedHtml(latestMessage),
      threadId: latestMessage.threadId ?? threadId ?? undefined,
      headers: buildReplyHeaders(latestMessage),
    })
  }, [latestMessage, threadId, openCompose])

  const handleReplyAll = useCallback(() => {
    if (!latestMessage) return
    const subject = latestMessage.subject?.startsWith("Re:")
      ? latestMessage.subject
      : `Re: ${latestMessage.subject ?? ""}`

    const replyTo = latestMessage.replyTo || latestMessage.sender?.email || ""
    const allTo = [
      replyTo,
      ...(latestMessage.to?.map((r) => r.email) ?? []),
    ].filter((e) => e && !myEmails.has(e.toLowerCase()))

    const allCc = (latestMessage.cc ?? [])
      .map((r) => r.email)
      .filter((e) => e && !myEmails.has(e.toLowerCase()))

    openCompose({
      to: allTo.length > 0 ? allTo : [replyTo],
      cc: allCc.length > 0 ? allCc : undefined,
      subject,
      message: buildQuotedHtml(latestMessage),
      threadId: latestMessage.threadId ?? threadId ?? undefined,
      headers: buildReplyHeaders(latestMessage),
    })
  }, [latestMessage, threadId, myEmails, openCompose])

  const handleForward = useCallback(() => {
    if (!latestMessage) return
    const subject = latestMessage.subject?.startsWith("Fwd:")
      ? latestMessage.subject
      : `Fwd: ${latestMessage.subject ?? ""}`

    const date = latestMessage.receivedOn
      ? new Date(latestMessage.receivedOn).toLocaleString()
      : ""
    const from = latestMessage.sender?.name
      ? `${latestMessage.sender.name} <${latestMessage.sender.email}>`
      : (latestMessage.sender?.email ?? "")
    const to = latestMessage.to?.map((r) => r.email).join(", ") ?? ""

    const fwdHeader = `<br/><br/>---------- Forwarded message ----------<br/>From: ${from}<br/>Date: ${date}<br/>Subject: ${latestMessage.subject ?? ""}<br/>To: ${to}<br/><br/>`

    openCompose({
      subject,
      message: `${fwdHeader}${latestMessage.decodedBody ?? ""}`,
    })
  }, [latestMessage, openCompose])

  return { handleReply, handleReplyAll, handleForward, latestMessage }
}
