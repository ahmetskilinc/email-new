// @ts-nocheck
import { CssSanitizer } from "@barkleapp/css-sanitizer"
import sanitizeHtml from "sanitize-html"
import * as cheerio from "cheerio"

const sanitizer = new CssSanitizer({
  allowedProperties: new Set([
    "src",
    "font-display",
    "font-stretch",
    "font-variant",
    "unicode-range",
    "font-feature-settings",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-color",
    "border-style",
    "border-width",
    "border-collapse",
    "border-spacing",
    "table-layout",
    "list-style",
    "list-style-type",
    "text-indent",
    "direction",
    "unicode-bidi",
    "font-style",
    "background-image",
    "background-position",
    "background-repeat",
    "background-size",
  ]),
  validateUrl: (url: string) => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === "https:" || parsed.protocol === "http:"
    } catch {
      return false
    }
  },
  sanitizeUrl: (url: string) => {
    try {
      const parsed = new URL(url)
      // Allow font CDNs and common email image hosts
      const allowedHosts = [
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "use.typekit.net",
        "p.typekit.net",
        "fast.fonts.net",
        "cloud.typography.com",
        "fonts.bunny.net",
      ]
      if (
        allowedHosts.some(
          (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h)
        )
      ) {
        return url
      }
      // Allow data: URIs for embedded fonts
      if (url.startsWith("data:")) return url
      return ""
    } catch {
      return ""
    }
  },
})

interface ProcessEmailOptions {
  html: string
  shouldLoadImages: boolean
  theme: "light" | "dark"
}

// Server-side: Heavy lifting, preference-independent processing
function preprocessEmailHtml(html: string): string {
  const sanitizeConfig: sanitizeHtml.IOptions = {
    allowVulnerableTags: true,
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "title",
      "details",
      "summary",
      "style",
      "link",
    ]),

    allowedAttributes: {
      "*": [
        "class",
        "style",
        "align",
        "valign",
        "width",
        "height",
        "cellpadding",
        "cellspacing",
        "border",
        "bgcolor",
        "colspan",
        "rowspan",
      ],
      a: ["href", "name", "target", "rel", "class", "style"],
      img: ["src", "alt", "width", "height", "class", "style"],
      link: ["rel", "href", "type"],
    },

    // Allow only safe schemes - no blob for security
    allowedSchemes: ["http", "https", "mailto", "tel", "data", "cid"],
    allowedSchemesByTag: {
      img: ["http", "https", "data", "cid"],
    },

    transformTags: {
      a: (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: attribs.target || "_blank",
            rel: "noopener noreferrer",
          },
        }
      },
      link: (tagName, attribs) => {
        // Only allow stylesheet links (for web fonts)
        if (
          attribs.rel === "stylesheet" &&
          attribs.href &&
          (attribs.href.startsWith("https://fonts.googleapis.com/") ||
            attribs.href.startsWith("https://fonts.gstatic.com/") ||
            attribs.href.startsWith("https://use.typekit.net/"))
        ) {
          return { tagName, attribs }
        }
        // Strip non-stylesheet or untrusted link tags
        return { tagName: "", attribs: {} }
      },
    },
  }

  const sanitized = sanitizeHtml(html, sanitizeConfig)
  const $ = cheerio.load(sanitized)

  $("style").each((_, el) => {
    const css = $(el).html() || ""
    const safe = sanitizer.sanitizeCss(css)
    $(el).html(safe)
  })

  // Collapse quoted text (structure only, no theme colors)
  // const collapseQuoted = (selector: string) => {
  //   $(selector).each((_, el) => {
  //     const $el = $(el);
  //     if ($el.parents('details.quoted-toggle').length) return;

  //     const innerHtml = $el.html();
  //     if (typeof innerHtml !== 'string') return;
  //     const detailsHtml = `<details class="quoted-toggle" style="margin-top:1em;">
  //         <summary style="cursor:pointer;" data-theme-color="muted">
  //           Show quoted text
  //         </summary>
  //         ${innerHtml}
  //       </details>`;

  //     $el.replaceWith(detailsHtml);
  //   });
  // };

  // collapseQuoted('blockquote');
  // collapseQuoted('.gmail_quote');

  // Remove unwanted elements
  $("title").remove()
  $('img[width="1"][height="1"]').remove()
  $('img[width="0"][height="0"]').remove()

  // Remove preheader content
  $('.preheader, .preheaderText, [class*="preheader"]').each((_, el) => {
    const $el = $(el)
    const style = $el.attr("style") || ""
    if (
      style.includes("display:none") ||
      style.includes("display: none") ||
      style.includes("font-size:0") ||
      style.includes("font-size: 0") ||
      style.includes("line-height:0") ||
      style.includes("line-height: 0") ||
      style.includes("max-height:0") ||
      style.includes("max-height: 0") ||
      style.includes("mso-hide:all") ||
      style.includes("opacity:0") ||
      style.includes("opacity: 0")
    ) {
      $el.remove()
    }
  })

  return $.html()
}

// Client-side: Light styling + image preferences
function applyEmailPreferences(
  preprocessedHtml: string,
  theme: "light" | "dark",
  shouldLoadImages: boolean
): { processedHtml: string; hasBlockedImages: boolean } {
  let hasBlockedImages = false
  const isDarkTheme = theme === "dark"

  const $ = cheerio.load(preprocessedHtml)

  // Handle image blocking if needed
  if (!shouldLoadImages) {
    $("img").each((_, el) => {
      const $img = $(el)
      const src = $img.attr("src")

      // Allow CID images (inline attachments)
      if (src && !src.startsWith("cid:")) {
        hasBlockedImages = true
        $img.replaceWith(
          `<span style="display:none;"><!-- blocked image: ${src} --></span>`
        )
      }
    })
  }

  const html = $.html()

  // Apply theme-specific styles
  const themeStyles = `
    <style type="text/css">
      :host {
        display: block;
        line-height: 1.5;
        background-color: ${isDarkTheme ? "#1A1A1A" : "#ffffff"};
        color: ${isDarkTheme ? "#ffffff" : "#000000"};
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
      }

      a {
        cursor: pointer;
        color: ${isDarkTheme ? "#60a5fa" : "#2563eb"};
        text-decoration: underline;
      }

      table {
        border-collapse: collapse;
      }

      ::selection {
        background: #b3d4fc;
        text-shadow: none;
      }

      /* Styling for collapsed quoted text */
      details.quoted-toggle {
        border-left: 2px solid ${isDarkTheme ? "#374151" : "#d1d5db"};
        padding-left: 8px;
        margin-top: 0.75rem;
      }

      details.quoted-toggle summary {
        cursor: pointer;
        color: ${isDarkTheme ? "#9CA3AF" : "#6B7280"};
        list-style: none;
        user-select: none;
      }

      details.quoted-toggle summary::-webkit-details-marker {
        display: none;
      }

      [data-theme-color="muted"] {
        color: ${isDarkTheme ? "#9CA3AF" : "#6B7280"};
      }
    </style>
  `

  const finalHtml = `${themeStyles}${html}`

  return {
    processedHtml: finalHtml,
    hasBlockedImages,
  }
}

// Original function for backward compatibility
export function processEmailHtml({
  html,
  shouldLoadImages,
  theme,
}: ProcessEmailOptions): {
  processedHtml: string
  hasBlockedImages: boolean
} {
  const preprocessed = preprocessEmailHtml(html)
  return applyEmailPreferences(preprocessed, theme, shouldLoadImages)
}
