import {
  GmailColor,
  ICloudColor,
  OutlookColor,
  YahooColor,
  MailServerColor,
} from "@workspace/ui/components/icons"

// BASE_URL is a leftover from the web app (used for constructing absolute
// URLs to API routes). The desktop renderer has no such concept — all
// network I/O goes through the main process via IPC — so this resolves
// to an empty string. Kept as an export so components that still reference
// it don't need to be touched.
export const BASE_URL = ""

export const CACHE_BURST_KEY = "cache-burst:v0.0.1"

export const emailProviders = [
  {
    name: "Gmail",
    providerId: "google",
    icon: GmailColor,
  },
  {
    name: "iCloud Mail",
    providerId: "icloud",
    icon: ICloudColor,
  },
  {
    name: "Outlook",
    providerId: "microsoft",
    icon: OutlookColor,
  },
  {
    name: "Yahoo Mail",
    providerId: "yahoo",
    icon: YahooColor,
  },
  {
    name: "Custom IMAP",
    providerId: "custom",
    icon: MailServerColor,
  },
] as const
