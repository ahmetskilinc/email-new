import { describe, expect, test } from "bun:test"
import {
  folderLabelId,
  folderToLabel,
  resolveFolder,
  threadIdFor,
  toParsedMessage,
  toThreadRows,
} from "../mapper"
import type { ICloudFolder, ICloudMessageSummary } from "../types"

const folders: ICloudFolder[] = [
  { guid: "f-inbox", name: "INBOX", role: "inbox" },
  { guid: "f-sent", name: "Sent Messages", role: "sent" },
  { guid: "f-trash", name: "Deleted Messages", role: "trash" },
  { guid: "f-receipts", name: "Receipts" },
]

const message = (
  overrides: Partial<ICloudMessageSummary> = {}
): ICloudMessageSummary => ({
  guid: "m1",
  subject: "Hello",
  from: { name: "Ada", email: "ada@icloud.com" },
  to: [{ email: "you@icloud.com" }],
  cc: [],
  bcc: [],
  date: "2024-03-01T10:00:00.000Z",
  unread: true,
  flagged: false,
  draft: false,
  hasAttachments: false,
  ...overrides,
})

describe("folder labels", () => {
  test("maps well-known folders onto the shared label vocabulary", () => {
    expect(folderLabelId(folders[0]!)).toBe("INBOX")
    expect(folderLabelId(folders[1]!)).toBe("SENT")
    expect(folderLabelId(folders[2]!)).toBe("TRASH")
  })

  test("addresses a user folder by its name", () => {
    expect(folderLabelId(folders[3]!)).toBe("RECEIPTS")
  })

  test("marks system folders as system", () => {
    expect(folderToLabel(folders[0]!).type).toBe("system")
    expect(folderToLabel(folders[3]!).type).toBe("user")
  })
})

describe("resolveFolder", () => {
  test("resolves a label id", () => {
    expect(resolveFolder(folders, "SENT")?.guid).toBe("f-sent")
  })

  test("resolves a folder name regardless of case", () => {
    expect(resolveFolder(folders, "deleted messages")?.guid).toBe("f-trash")
  })

  test("resolves a raw Apple guid", () => {
    expect(resolveFolder(folders, "f-receipts")?.guid).toBe("f-receipts")
  })

  test("defaults an empty request to the inbox", () => {
    expect(resolveFolder(folders, "")?.guid).toBe("f-inbox")
  })

  test("returns nothing for an unknown folder", () => {
    expect(resolveFolder(folders, "NOPE")).toBeUndefined()
  })
})

describe("threading", () => {
  test("prefers Apple's conversation id", () => {
    expect(threadIdFor(message({ conversationId: "c1" }))).toBe("c1")
  })

  test("falls back to the message guid", () => {
    expect(threadIdFor(message())).toBe("m1")
  })

  test("collapses a page into one row per conversation, newest kept", () => {
    const rows = toThreadRows([
      message({ guid: "m2", conversationId: "c1" }),
      message({ guid: "m1", conversationId: "c1" }),
      message({ guid: "m3", conversationId: "c2" }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe("c1")
    expect(rows[1]?.id).toBe("c2")
  })

  test("gives each row a sortable history id", () => {
    const [row] = toThreadRows([message()])
    expect(row?.historyId).toBe(
      String(new Date("2024-03-01T10:00:00.000Z").getTime())
    )
  })
})

describe("toParsedMessage", () => {
  test("maps an Apple message into the app's shape", () => {
    const parsed = toParsedMessage(
      {
        ...message({ conversationId: "c1", flagged: true }),
        html: "<p>hi</p>",
        text: "hi",
        attachments: [
          {
            attachmentId: "a1",
            filename: "x.pdf",
            mimeType: "application/pdf",
            size: 10,
            body: "",
          },
        ],
      },
      { folder: folders[0] }
    )

    expect(parsed.id).toBe("m1")
    expect(parsed.threadId).toBe("c1")
    expect(parsed.sender.email).toBe("ada@icloud.com")
    expect(parsed.body).toBe("<p>hi</p>")
    expect(parsed.unread).toBe(true)
    expect(parsed.attachments?.[0]?.filename).toBe("x.pdf")
    // `labels` rides along on the message the way the other drivers emit it,
    // even though ParsedMessage does not declare it.
    const labels = (parsed as unknown as { labels: { id: string }[] }).labels
    expect(labels.map((label) => label.id)).toEqual([
      "INBOX",
      "STARRED",
      "UNREAD",
    ])
  })

  test("never fills processedHtml, which means sanitized output", () => {
    const parsed = toParsedMessage({
      ...message(),
      html: "<img src=x onerror=alert(1)>",
      attachments: [],
    })
    expect(parsed.processedHtml).toBe("")
  })

  test("falls back to the text body, then the snippet", () => {
    expect(
      toParsedMessage({ ...message(), text: "plain", attachments: [] }).body
    ).toBe("plain")
    expect(
      toParsedMessage({ ...message({ snippet: "preview" }), attachments: [] })
        .body
    ).toBe("preview")
  })

  test("represents empty cc/bcc as null, as the other drivers do", () => {
    const parsed = toParsedMessage(message())
    expect(parsed.cc).toBeNull()
    expect(parsed.bcc).toBeNull()
  })
})
