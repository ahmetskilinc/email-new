import { describe, expect, test } from "bun:test"
import { processEmailHtml } from "../email-processor"

const render = (html: string, shouldLoadImages = false) =>
  processEmailHtml({ html, shouldLoadImages, theme: "light" }).processedHtml

/**
 * Message bodies are fully attacker-controlled: anyone can email the victim.
 * Containment ultimately comes from the sandboxed iframe in mail-content.tsx,
 * but the sanitizer must not hand it live markup either.
 */
describe("email sanitization", () => {
  test("strips script tags and event handlers", () => {
    const out = render(`<script>alert(1)</script><img src=x onerror=alert(1)>`)
    expect(out).not.toContain("<script")
    expect(out).not.toMatch(/onerror/i)
  })

  // Regression: the blocked-image placeholder templated the attacker-controlled
  // src into an HTML comment, and cheerio's replaceWith() parses its argument as
  // HTML, so "-->" broke out and injected live elements after sanitization.
  test("does not let a blocked image src break out of its placeholder", () => {
    const payload = `<img src='--></span><img src=x onerror=alert(1)><span><!--'>`
    const out = render(payload, false)
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toContain("-->")
  })

  test("still blocks remote images when images are disabled", () => {
    const result = processEmailHtml({
      html: `<img src="https://tracker.example/pixel.gif">`,
      shouldLoadImages: false,
      theme: "light",
    })
    expect(result.hasBlockedImages).toBe(true)
    expect(result.processedHtml).not.toContain("tracker.example")
  })

  test("keeps inline cid images, which are attachments not remote loads", () => {
    const result = processEmailHtml({
      html: `<img src="cid:logo@example">`,
      shouldLoadImages: false,
      theme: "light",
    })
    expect(result.hasBlockedImages).toBe(false)
  })

  test("removes external stylesheet links", () => {
    const out = render(`<link rel="stylesheet" href="https://evil.tld/x.css">`)
    expect(out).not.toContain("<link")
  })

  test("strips @import from style blocks", () => {
    const out = render(
      `<style>@import url("https://evil.tld/x.css"); p { color: red }</style><p>hi</p>`,
      true
    )
    expect(out).not.toMatch(/@import/i)
  })

  test("forces noopener/noreferrer on links", () => {
    const out = render(`<a href="https://example.com">x</a>`, true)
    expect(out).toContain('rel="noopener noreferrer"')
  })

  test("drops javascript: hrefs", () => {
    const out = render(`<a href="javascript:alert(1)">x</a>`, true)
    expect(out).not.toMatch(/javascript:/i)
  })

  test("removes tracking pixels", () => {
    const out = render(
      `<img src="https://t.example/p" width="1" height="1">`,
      true
    )
    expect(out).not.toContain("t.example")
  })

  test("handles empty and malformed input without throwing", () => {
    expect(() => render("")).not.toThrow()
    expect(() => render("<div><p>unclosed")).not.toThrow()
  })
})
