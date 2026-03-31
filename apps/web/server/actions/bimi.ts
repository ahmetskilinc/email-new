"use server"

import { requireSession } from "../lib/session"

async function fetchBimiRecord(domain: string) {
  try {
    const url = `https://dns.google/resolve?name=default._bimi.${domain}&type=TXT`
    const res = await fetch(url)
    const data = await res.json()

    if (!data.Answer) return null

    for (const answer of data.Answer) {
      const txt = answer.data?.replace(/"/g, "")
      if (txt?.includes("v=BIMI1")) {
        const match = txt.match(/l=([^;\s]+)/)
        if (match?.[1]) return match[1]
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
