import sanitizeHtml from "sanitize-html"

interface InlineImage {
  cid: string
  data: string
  mimeType: string
}

export const sanitizeTipTapHtml = async (
  html: string,
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
    },
  )

  const clean = sanitizeHtml(processedHtml, {
    allowVulnerableTags: true,
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height", "style"],
    },
    allowedSchemes: ["http", "https", "cid", "data"],
  })

  const renderedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${clean}</body></html>`

  return {
    html: renderedHtml,
    inlineImages,
  }
}
