import { describe, expect, test } from "bun:test"
import {
  LimitExceededError,
  MAX_BULK_IDS,
  MAX_PAGE_SIZE,
  assertBulkIds,
  clampPageSize,
  mapWithConcurrency,
} from "../limits"

describe("assertBulkIds", () => {
  test("accepts a normal batch", () => {
    expect(assertBulkIds(["a", "b"])).toEqual(["a", "b"])
  })

  test("rejects a batch over the cap", () => {
    const ids = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => String(i))
    expect(() => assertBulkIds(ids)).toThrow(LimitExceededError)
  })

  // Empty ids matched unrelated messages in the IMAP driver, because
  // getThreadRoot returns "" for messages with no Message-ID.
  test("drops empty strings and non-strings", () => {
    expect(assertBulkIds(["a", "", "b"])).toEqual(["a", "b"])
    expect(assertBulkIds([1, null, "c"] as unknown)).toEqual(["c"])
  })

  test("rejects a non-array", () => {
    expect(() => assertBulkIds("nope" as unknown)).toThrow(LimitExceededError)
  })
})

describe("clampPageSize", () => {
  test("clamps into range instead of rejecting, so paging keeps working", () => {
    expect(clampPageSize(10_000, 20)).toBe(MAX_PAGE_SIZE)
    expect(clampPageSize(0, 20)).toBe(1)
    expect(clampPageSize(-5, 20)).toBe(1)
    expect(clampPageSize(50, 20)).toBe(50)
  })

  test("falls back when the value is absent or not a number", () => {
    expect(clampPageSize(undefined, 20)).toBe(20)
    expect(clampPageSize(NaN, 20)).toBe(20)
  })
})

describe("mapWithConcurrency", () => {
  test("preserves input order in the results", async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 2
    )
    expect(
      results.map((r) => (r.status === "fulfilled" ? r.value : null))
    ).toEqual([2, 4, 6, 8, 10])
  })

  test("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1))
      active--
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  test("isolates failures instead of rejecting the whole batch", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom")
      return n
    })
    expect(results[0]?.status).toBe("fulfilled")
    expect(results[1]?.status).toBe("rejected")
    expect(results[2]?.status).toBe("fulfilled")
  })

  test("handles an empty input", async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
  })
})
