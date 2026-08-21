import { describe, expect, test } from "bun:test"
import {
  decodeCursor,
  encodeCursor,
  normalizeFolderRole,
  parseAddressString,
  readArray,
  readDate,
  readFolder,
  readMessageDetail,
  readMessageSummary,
} from "../operations"

describe("readArray", () => {
  test("finds a list at the top level", () => {
    expect(readArray({ folders: [{ guid: "1" }] }, ["folders"])).toHaveLength(1)
  })

  test("finds a list inside a result wrapper", () => {
    expect(
      readArray({ result: { items: [{ guid: "1" }, { guid: "2" }] } }, [
        "items",
      ])
    ).toHaveLength(2)
  })

  test("accepts a bare array payload", () => {
    expect(readArray([{ guid: "1" }], ["folders"])).toHaveLength(1)
  })

  test("returns empty for an unrecognised payload", () => {
    expect(readArray({ nothing: true }, ["folders"])).toEqual([])
  })
})

describe("folder reading", () => {
  test("reads a folder under any of Apple's id spellings", () => {
    expect(readFolder({ folderId: "abc", name: "Inbox" })?.guid).toBe("abc")
    expect(readFolder({ objId: "abc", name: "Inbox" })?.guid).toBe("abc")
  })

  test("skips a folder with no identifier", () => {
    expect(readFolder({ name: "Inbox" })).toBeNull()
  })

  test("recognises roles from an explicit field", () => {
    expect(normalizeFolderRole({ role: "Sent" })).toBe("sent")
    expect(normalizeFolderRole({ specialUse: "\\Junk" })).toBe("junk")
  })

  test("falls back to Apple's folder names", () => {
    expect(normalizeFolderRole({ name: "Deleted Messages" })).toBe("trash")
    expect(normalizeFolderRole({ name: "Sent Messages" })).toBe("sent")
    expect(normalizeFolderRole({ name: "Junk" })).toBe("junk")
  })

  test("leaves a user folder unroled", () => {
    expect(normalizeFolderRole({ name: "Receipts" })).toBeUndefined()
  })

  test("reads counts", () => {
    const folder = readFolder({
      guid: "1",
      name: "Inbox",
      unreadCount: 3,
      totalCount: 40,
    })
    expect(folder?.unreadCount).toBe(3)
    expect(folder?.totalCount).toBe(40)
  })
})

describe("address parsing", () => {
  test("splits a display name from an address", () => {
    expect(parseAddressString('"Ada Lovelace" <ada@icloud.com>')).toEqual({
      name: "Ada Lovelace",
      email: "ada@icloud.com",
    })
  })

  test("accepts a bare address", () => {
    expect(parseAddressString("ada@icloud.com")).toEqual({
      email: "ada@icloud.com",
    })
  })

  test("rejects something that is not an address", () => {
    expect(parseAddressString("Ada Lovelace")).toBeNull()
  })
})

describe("readDate", () => {
  test("reads epoch milliseconds", () => {
    expect(readDate({ date: 1700000000000 })).toBe(
      new Date(1700000000000).toISOString()
    )
  })

  test("reads epoch seconds", () => {
    expect(readDate({ date: 1700000000 })).toBe(
      new Date(1700000000000).toISOString()
    )
  })

  test("reads an ISO string", () => {
    expect(readDate({ dateReceived: "2024-03-01T10:00:00.000Z" })).toBe(
      "2024-03-01T10:00:00.000Z"
    )
  })

  test("falls back to the epoch rather than an invalid date", () => {
    expect(readDate({ date: "not a date" })).toBe(new Date(0).toISOString())
    expect(new Date(readDate({})).getTime()).toBe(0)
  })
})

describe("readMessageSummary", () => {
  const raw = {
    guid: "msg-1",
    folderId: "folder-1",
    conversationId: "conv-1",
    subject: "Hello",
    from: { name: "Ada", email: "ada@icloud.com" },
    to: [{ email: "you@icloud.com" }],
    cc: "cc@icloud.com",
    date: 1700000000000,
    flags: { seen: false, flagged: true },
    preview: "Hi there",
    hasAttachments: true,
  }

  test("normalizes an Apple message", () => {
    const message = readMessageSummary(raw)!
    expect(message.guid).toBe("msg-1")
    expect(message.conversationId).toBe("conv-1")
    expect(message.from?.email).toBe("ada@icloud.com")
    expect(message.to).toHaveLength(1)
    expect(message.cc[0]?.email).toBe("cc@icloud.com")
    expect(message.unread).toBe(true)
    expect(message.flagged).toBe(true)
    expect(message.hasAttachments).toBe(true)
    expect(message.snippet).toBe("Hi there")
  })

  test("derives unread from a seen flag and defaults it to read", () => {
    expect(
      readMessageSummary({ guid: "a", flags: { seen: true } })?.unread
    ).toBe(false)
    expect(readMessageSummary({ guid: "a" })?.unread).toBe(false)
  })

  test("infers attachments from the attachment list when no flag is present", () => {
    expect(
      readMessageSummary({ guid: "a", attachments: [{ name: "x" }] })
        ?.hasAttachments
    ).toBe(true)
    expect(
      readMessageSummary({ guid: "a", attachments: [] })?.hasAttachments
    ).toBe(false)
  })

  test("reads threading headers", () => {
    const message = readMessageSummary({
      guid: "a",
      headers: {
        "message-id": "<abc@icloud.com>",
        references: "<root@icloud.com>",
        "in-reply-to": "<root@icloud.com>",
      },
    })!
    expect(message.messageId).toBe("<abc@icloud.com>")
    expect(message.references).toBe("<root@icloud.com>")
    expect(message.inReplyTo).toBe("<root@icloud.com>")
  })

  test("skips a message with no identifier", () => {
    expect(readMessageSummary({ subject: "orphan" })).toBeNull()
  })

  test("substitutes a subject rather than leaving it blank", () => {
    expect(readMessageSummary({ guid: "a" })?.subject).toBe("(no subject)")
  })
})

describe("readMessageDetail", () => {
  test("reads body, headers and attachments", () => {
    const detail = readMessageDetail({
      message: {
        guid: "msg-1",
        subject: "Hi",
        date: 1700000000000,
        body: { html: "<p>hi</p>", text: "hi" },
        headers: { "list-unsubscribe": "<mailto:x@icloud.com>" },
        attachments: [
          {
            guid: "att-1",
            name: "a.pdf",
            mimeType: "application/pdf",
            size: 12,
          },
        ],
      },
    })!
    expect(detail.html).toBe("<p>hi</p>")
    expect(detail.text).toBe("hi")
    expect(detail.listUnsubscribe).toBe("<mailto:x@icloud.com>")
    expect(detail.attachments[0]?.attachmentId).toBe("att-1")
    expect(detail.attachments[0]?.mimeType).toBe("application/pdf")
  })

  test("reads a message returned at the top level", () => {
    expect(
      readMessageDetail({ guid: "msg-1", subject: "Hi", html: "<p>x</p>" })
        ?.guid
    ).toBe("msg-1")
  })

  test("returns null when there is no message at all", () => {
    expect(readMessageDetail(null)).toBeNull()
  })
})

describe("cursors", () => {
  test("round-trip an offset", () => {
    expect(decodeCursor(encodeCursor(50))).toBe(50)
  })

  test("treat a missing or bogus cursor as the start", () => {
    expect(decodeCursor(null)).toBe(0)
    expect(decodeCursor("garbage")).toBe(0)
    expect(decodeCursor("-5")).toBe(0)
  })
})
