"use server"

import { requireSession } from "../lib/session"

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\]|\d+)$/

// The BIMI record is published by the *sender's* DNS, so the "l=" value is
// attacker-controlled: whatever comes back here ends up as a URL the victim's
// browser fetches. Only accept plain https origins, and never a bare IP, so a
// sender can't point us at an internal host or a non-http scheme.
function isSafeLogoUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  if (IP_LITERAL.test(parsed.hostname)) return false
  return true
}

async function fetchBimiRecord(domain: string) {
  try {
    // domain comes straight off an email address, so it has to be escaped or it
    // can inject extra query parameters into the DoH request.
    const url = `https://dns.google/resolve?name=default._bimi.${encodeURIComponent(domain)}&type=TXT`
    // Bound the request so a slow or endless DNS responder can't pin a server
    // action open.
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()

    if (!data.Answer) return null

    for (const answer of data.Answer) {
      const txt = answer.data?.replace(/"/g, "")
      if (txt?.includes("v=BIMI1")) {
        const match = txt.match(/l=([^;\s]+)/)
        if (match?.[1] && isSafeLogoUrl(match[1])) return match[1]
      }
    }

    return null
  } catch {
    return null
  }
}

export async function getBimiByEmail(email: string) {
  await requireSession()
  const domain = email.split("@")[1]
  if (!domain) return null
  return fetchBimiRecord(domain)
}

export async function getBimiByDomain(domain: string) {
  await requireSession()
  return fetchBimiRecord(domain)
}
