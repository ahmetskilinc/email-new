import type { ParsedMessage } from "@/server/types"

function formatSenders(
  senders: { name?: string; email: string }[] | null | undefined,
): string {
  if (!senders?.length) return ""
  return senders.map((s) => (s.name ? `${s.name} &lt;${s.email}&gt;` : s.email)).join(", ")
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr
  }
}

export function buildPrintHtml(messages: ParsedMessage[]): string {
  const subject = messages[0]?.subject ?? "No Subject"

  const messageBlocks = messages
    .map((msg, i) => {
      const attachmentList =
        msg.attachments?.length
          ? `<div class="attachments">
              <strong>Attachments:</strong> ${msg.attachments.map((a) => `${a.filename} (${(a.size / 1024).toFixed(1)} KB)`).join(", ")}
            </div>`
          : ""

      return `
        ${i > 0 ? '<hr class="separator">' : ""}
        <div class="message">
          <table class="header-table">
            <tr><td class="label">From:</td><td>${msg.sender.name ? `${msg.sender.name} &lt;${msg.sender.email}&gt;` : msg.sender.email}</td></tr>
            <tr><td class="label">To:</td><td>${formatSenders(msg.to)}</td></tr>
            ${msg.cc?.length ? `<tr><td class="label">Cc:</td><td>${formatSenders(msg.cc)}</td></tr>` : ""}
            <tr><td class="label">Date:</td><td>${formatDate(msg.receivedOn)}</td></tr>
          </table>
          <div class="body">${msg.processedHtml || msg.body}</div>
          ${attachmentList}
        </div>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
      font-size: 14px;
      line-height: 1.5;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e5e5e5;
    }
    .header-table {
      margin-bottom: 16px;
      border-collapse: collapse;
    }
    .header-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .header-table .label {
      font-weight: 600;
      padding-right: 12px;
      white-space: nowrap;
      color: #666;
    }
    .body {
      margin: 16px 0;
    }
    .body img { max-width: 100%; }
    .attachments {
      margin-top: 12px;
      padding: 8px 12px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 13px;
      color: #555;
    }
    .separator {
      border: none;
      border-top: 1px solid #e5e5e5;
      margin: 24px 0;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <h1>${subject}</h1>
  ${messageBlocks}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
}
