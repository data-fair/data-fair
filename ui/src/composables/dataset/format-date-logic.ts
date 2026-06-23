import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'

// only the utc plugin is needed here (for utcOffset()/utc()); the localizedFormat plugin behind the
// 'lll'/'L' tokens is already extended on the shared dayjs singleton by @data-fair/lib-vue's
// useLocaleDayjs, so we must not re-import it from app source (Vite serves that CJS plugin without a
// usable default export). The node unit test extends localizedFormat itself if it ever needs it.
dayjs.extend(utc)

// Data-Fair stores date-time values with their original UTC offset preserved (e.g.
// "2024-06-15T10:00:00+02:00"), never normalized to "Z". When displaying such a value
// we want to show it in the timezone it was authored/stored in — NOT shift it to the
// viewer's browser timezone (which would make the same row read differently depending
// on who looks at it, and produce the classic "off by one day" near midnight).
//
// dayjs() parses the instant correctly but renders it in the local timezone, so we read
// the offset back from the string and re-apply it. Values stored as UTC ("...Z") carry no
// source timezone, so we keep the historical behaviour of rendering them in the viewer's
// timezone. See docs/architecture/date-management.md.
const offsetRegExp = /([+-])(\d{2}):?(\d{2})$/

// The numeric offset (in minutes) carried by a date-time string, or null when the value has
// no source timezone to honour: either UTC-stored ("...Z") or offset-less. Such values are
// displayed in the viewer's local timezone.
export const explicitOffsetMinutes = (value: any): number | null => {
  if (typeof value !== 'string' || value.endsWith('Z')) return null
  const match = value.match(offsetRegExp)
  if (!match) return null
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
}

export const dateTimeInOwnTimeZone = (dayjsFactory: typeof dayjs, value: any) => {
  const offsetMinutes = explicitOffsetMinutes(value)
  return offsetMinutes === null ? dayjsFactory(value) : dayjsFactory(value).utcOffset(offsetMinutes)
}

// "UTC", "UTC+1", "UTC-3", "UTC+5:30" — a compact, locale-neutral offset label.
export const formatUtcOffset = (minutes: number): string => {
  if (minutes === 0) return 'UTC'
  const sign = minutes > 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  return `UTC${sign}${hours}${mins ? ':' + String(mins).padStart(2, '0') : ''}`
}

// Short label for a date-time column header: the timezone its values are displayed in.
// Returns null when values are shown in the viewer's local timezone (so the caller can say
// "your timezone" instead of pinning a fixed zone). `field.timeZone`, when present, names the
// zone; the offset comes from the value itself (DST-correct for that row).
export const dateTimeZoneLabel = (sampleValue: any, field?: { timeZone?: string | null }): string | null => {
  const offsetMinutes = explicitOffsetMinutes(sampleValue)
  if (offsetMinutes === null) return null
  const offsetLabel = formatUtcOffset(offsetMinutes)
  return field?.timeZone ? `${field.timeZone} (${offsetLabel})` : offsetLabel
}

export interface DateTimeBreakdownLine {
  kind: 'source' | 'utc' | 'local'
  time: string
  zone?: string
}

// The equivalents shown in a date-time cell tooltip: the value in its source timezone, in UTC,
// and in the viewer's local timezone — skipping any line that would duplicate the source.
export const dateTimeBreakdown = (
  dayjsFactory: typeof dayjs,
  value: any,
  viewerZoneName?: string,
  format = 'lll'
): DateTimeBreakdownLine[] => {
  const offsetMinutes = explicitOffsetMinutes(value)
  const source = dateTimeInOwnTimeZone(dayjsFactory, value).format(format)
  const lines: DateTimeBreakdownLine[] = [{
    kind: 'source',
    time: source,
    // an offset-less/UTC value is already rendered in the viewer's zone
    zone: offsetMinutes === null ? viewerZoneName : formatUtcOffset(offsetMinutes)
  }]

  const utcTime = dayjsFactory(value).utc().format(format)
  if (utcTime !== source) lines.push({ kind: 'utc', time: utcTime, zone: 'UTC' })

  const localTime = dayjsFactory(value).format(format)
  if (localTime !== source && localTime !== utcTime) {
    lines.push({ kind: 'local', time: localTime, zone: viewerZoneName })
  }

  return lines
}
