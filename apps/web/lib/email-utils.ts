import DOMPurify from "dompurify"

export const cleanHtml = (html: string) => {
  if (!html) return "<p><em>No email content available</em></p>"

  try {
    return DOMPurify.sanitize(html)
  } catch {
    return "<p><em>No email content available</em></p>"
  }
}
