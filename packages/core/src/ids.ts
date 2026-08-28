/**
 * Natural-key builders for sync records.
 *
 * Thread record ids are `${connectionId}:${providerThreadId}` — deliberately
 * identical to `emailThread.id` as built by the sync workflow, so the sync
 * store, the Postgres feeder cache, and the client agree on identity by
 * construction. Provider ids can themselves contain colons, so splitting
 * always cuts at the FIRST separator (connection ids are UUIDs and never
 * contain one).
 */

export function threadRecordId(
  connectionId: string,
  providerThreadId: string
): string {
  return `${connectionId}:${providerThreadId}`
}

export function messageRecordId(
  connectionId: string,
  providerMessageId: string
): string {
  return `${connectionId}:${providerMessageId}`
}

export function labelRecordId(
  connectionId: string,
  providerLabelId: string
): string {
  return `${connectionId}:${providerLabelId}`
}

export function splitRecordId(id: string): {
  connectionId: string
  providerId: string
} {
  const at = id.indexOf(":")
  if (at === -1) return { connectionId: id, providerId: "" }
  return { connectionId: id.slice(0, at), providerId: id.slice(at + 1) }
}
