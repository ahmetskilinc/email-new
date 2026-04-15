import { format, getDay } from "date-fns"

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  interval: number
  byDay?: string[]
  byMonthDay?: number
  until?: string
  count?: number
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
}

const DAY_ABBREVS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

export function parseRRule(rrule: string): RecurrenceRule | null {
  const ruleStr = rrule.replace(/^RRULE:/, "")
  const parts: Record<string, string> = {}
  for (const part of ruleStr.split(";")) {
    const eq = part.indexOf("=")
    if (eq > 0) parts[part.slice(0, eq)] = part.slice(eq + 1)
  }

  const freq = parts["FREQ"] as RecurrenceRule["freq"]
  if (!freq) return null

  return {
    freq,
    interval: parts["INTERVAL"] ? parseInt(parts["INTERVAL"]) : 1,
    byDay: parts["BYDAY"]?.split(","),
    byMonthDay: parts["BYMONTHDAY"] ? parseInt(parts["BYMONTHDAY"]) : undefined,
    until: parts["UNTIL"],
    count: parts["COUNT"] ? parseInt(parts["COUNT"]) : undefined,
  }
}

export function serializeRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(",")}`)
  if (rule.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${rule.byMonthDay}`)
  if (rule.until) parts.push(`UNTIL=${rule.until}`)
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`)
  return `RRULE:${parts.join(";")}`
}

export function describeRRule(rrule: string): string {
  const rule = parseRRule(rrule)
  if (!rule) return rrule

  const { freq, interval, byDay, count, until } = rule

  let desc = ""

  if (freq === "DAILY") {
    desc = interval === 1 ? "Every day" : `Every ${interval} days`
  } else if (freq === "WEEKLY") {
    if (byDay?.length) {
      const dayNames = byDay.map((d) => DAY_NAMES[d] ?? d)
      if (interval === 1) {
        desc = `Weekly on ${dayNames.join(", ")}`
      } else {
        desc = `Every ${interval} weeks on ${dayNames.join(", ")}`
      }
    } else {
      desc = interval === 1 ? "Every week" : `Every ${interval} weeks`
    }
  } else if (freq === "MONTHLY") {
    desc = interval === 1 ? "Every month" : `Every ${interval} months`
  } else if (freq === "YEARLY") {
    desc = interval === 1 ? "Every year" : `Every ${interval} years`
  }

  if (count) desc += `, ${count} times`
  if (until) {
    const u = until.length === 8
      ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
      : until.split("T")[0]
    desc += `, until ${u}`
  }

  return desc
}

export function getRecurrencePresets(date: Date): { label: string; value: string | null }[] {
  const dayAbbrev = DAY_ABBREVS[getDay(date)]!
  const dayName = DAY_NAMES[dayAbbrev]!
  const dayOfMonth = date.getDate()
  const weekNum = Math.ceil(dayOfMonth / 7)
  const ordinal = ["first", "second", "third", "fourth", "fifth"][weekNum - 1] ?? `${weekNum}th`

  return [
    { label: "Does not repeat", value: null },
    { label: "Daily", value: "RRULE:FREQ=DAILY" },
    { label: `Weekly on ${dayName}`, value: `RRULE:FREQ=WEEKLY;BYDAY=${dayAbbrev}` },
    { label: `Monthly on the ${ordinal} ${dayName}`, value: `RRULE:FREQ=MONTHLY;BYDAY=${weekNum}${dayAbbrev}` },
    { label: `Monthly on day ${dayOfMonth}`, value: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}` },
    { label: `Annually on ${format(date, "MMMM d")}`, value: "RRULE:FREQ=YEARLY" },
    { label: "Every weekday (Mon–Fri)", value: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  ]
}
