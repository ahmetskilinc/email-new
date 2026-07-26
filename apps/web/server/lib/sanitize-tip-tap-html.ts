import sanitizeHtml from "sanitize-html"

interface InlineImage {
  cid: string
  data: string
  mimeType: string
}

const tipTapSanitizeOptions: sanitizeHtml.IOptions = {
  allowVulnerableTags: true,
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "width", "height", "style"],
  },
  allowedSchemes: ["http", "https", "cid", "data"],
}

/**
 * Same rules as the send path, but returns a bare fragment: for editor HTML we
 * persist and later hand to dangerouslySetInnerHTML there is no message to
 * attach inline images to, and storing markup unsanitized would turn any
 * stored-HTML field into a lasting XSS foothold.
 */
export const sanitizeTipTapFragment = (html: string): string =>
  sanitizeHtml(html, tipTapSanitizeOptions)

export const sanitizeTipTapHtml = async (
  html: string
): Promise<{ html: string; inlineImages: InlineImage[] }> => {
  const inlineImages: InlineImage[] = []

  const processedHtml = html.replace(
    /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi,
    (match, mimeType, base64Data) => {
      const cid = `image_${crypto.randomUUID()}@0.email`
      inlineImages.push({
        cid,
        data: base64Data,
        mimeType,
      })

      return match.replace(/src=["']data:[^"']+["']/i, `src="cid:${cid}"`)
    }
  )

  const clean = sanitizeHtml(processedHtml, tipTapSanitizeOptions)

  const renderedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${clean}</body></html>`

  return {
    html: renderedHtml,
    inlineImages,
  }
}
