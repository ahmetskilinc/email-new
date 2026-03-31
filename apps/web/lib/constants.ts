import {
  GmailColor,
  ICloudColor,
  OutlookColor,
  YahooColor,
} from "@workspace/ui/components/icons"

export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL

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
] as const
