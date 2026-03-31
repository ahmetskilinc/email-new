// @ts-nocheck
import type { MailManager, ManagerConfig } from "./types"
import { OutlookMailManager } from "./microsoft"
import { GoogleMailManager } from "./google"
import { ICloudMailManager } from "./icloud"
import { YahooMailManager } from "./yahoo"
import type { EProviders } from "../../types"

export const createDriver = (
  provider: EProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  if (provider === "icloud") return new ICloudMailManager(config)
  if (provider === "google") return new GoogleMailManager(config)
  if (provider === "microsoft") return new OutlookMailManager(config)
  if (provider === "yahoo") return new YahooMailManager(config)
  throw new Error(`Provider ${provider} is not supported`)
}
