import { useEffect, useMemo } from "react"
import { useSettings } from "@/hooks/use-settings"

type MailLayout = "split" | "centered"

const COOKIE_NAME = "mail-layout"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1]
}

export function setMailLayoutCookie(value: MailLayout) {
  document.cookie = `${COOKIE_NAME}=${value};path=/;max-age=31536000;SameSite=Lax`
}

export function useMailLayout(): MailLayout {
  const cookieValue = useMemo(() => {
    const raw = getCookie(COOKIE_NAME)
    return raw === "split" || raw === "centered" ? raw : "split"
  }, [])

  const { data: settingsData } = useSettings()
  const dbValue = settingsData?.settings?.mailListLayout

  useEffect(() => {
    if (dbValue && dbValue !== getCookie(COOKIE_NAME)) {
      setMailLayoutCookie(dbValue)
    }
  }, [dbValue])

  return dbValue ?? cookieValue
}
