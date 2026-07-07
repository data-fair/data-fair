import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { dateTimeInOwnTimeZone, formatUtcOffset, explicitOffsetMinutes, dateTimeZoneLabel, dateTimeBreakdown } from '../../../ui/src/composables/dataset/format-date-logic.ts'

dayjs.extend(utc)

// a stand-in for the locale-bound dayjs factory injected by useLocaleDayjs in the UI
const dayjsFactory = ((value?: any) => dayjs(value)) as typeof dayjs

test.describe('dateTimeInOwnTimeZone', () => {
  // The whole point: a date-time is shown in the timezone it was authored/stored in,
  // never shifted to the viewer's browser timezone. These assertions hold under ANY
  // host timezone because the offset is read from the value itself.
  test('preserves the wall-clock of a value with a positive offset', () => {
    const d = dateTimeInOwnTimeZone(dayjsFactory, '2024-06-15T10:00:00+07:00')
    assert.equal(d.format('YYYY-MM-DD HH:mm'), '2024-06-15 10:00')
  })

  test('preserves the wall-clock of a value with a negative offset', () => {
    const d = dateTimeInOwnTimeZone(dayjsFactory, '2024-06-15T10:00:00-03:00')
    assert.equal(d.format('YYYY-MM-DD HH:mm'), '2024-06-15 10:00')
  })

  test('Z-suffixed (UTC) values fall back to the viewer timezone', () => {
    // no source offset to preserve, so behaviour matches a plain dayjs() parse
    const value = '2024-06-15T08:00:00Z'
    const d = dateTimeInOwnTimeZone(dayjsFactory, value)
    assert.equal(d.format('YYYY-MM-DD HH:mm'), dayjs(value).format('YYYY-MM-DD HH:mm'))
  })

  test('naive values (no offset, no Z) are parsed as-is', () => {
    const d = dateTimeInOwnTimeZone(dayjsFactory, '2024-06-15T10:00:00')
    assert.equal(d.format('YYYY-MM-DD HH:mm'), '2024-06-15 10:00')
  })
})

test.describe('formatUtcOffset', () => {
  test('formats whole-hour, half-hour, negative and zero offsets', () => {
    assert.equal(formatUtcOffset(60), 'UTC+1')
    assert.equal(formatUtcOffset(120), 'UTC+2')
    assert.equal(formatUtcOffset(-180), 'UTC-3')
    assert.equal(formatUtcOffset(330), 'UTC+5:30')
    assert.equal(formatUtcOffset(0), 'UTC')
  })
})

test.describe('explicitOffsetMinutes', () => {
  test('reads a numeric offset from the value', () => {
    assert.equal(explicitOffsetMinutes('2024-01-15T10:00:00+01:00'), 60)
    assert.equal(explicitOffsetMinutes('2024-01-15T10:00:00-03:30'), -210)
  })
  test('returns null for UTC (Z), offset-less and non-string values', () => {
    assert.equal(explicitOffsetMinutes('2024-01-15T10:00:00Z'), null)
    assert.equal(explicitOffsetMinutes('2024-01-15T10:00:00'), null)
    assert.equal(explicitOffsetMinutes(null), null)
  })
})

test.describe('dateTimeZoneLabel', () => {
  test('combines the field timezone name with the value offset', () => {
    assert.equal(dateTimeZoneLabel('2024-01-15T10:00:00+01:00', { timeZone: 'Europe/Paris' }), 'Europe/Paris (UTC+1)')
  })
  test('falls back to the offset alone when the field has no timezone', () => {
    assert.equal(dateTimeZoneLabel('2024-06-15T10:00:00+02:00', {}), 'UTC+2')
  })
  test('returns null when the value is shown in the viewer timezone (Z)', () => {
    assert.equal(dateTimeZoneLabel('2024-01-15T10:00:00Z', { timeZone: 'Europe/Paris' }), null)
  })
})

test.describe('dateTimeBreakdown', () => {
  test('reports source and UTC equivalents for an offset-bearing value', () => {
    const lines = dateTimeBreakdown(dayjsFactory, '2024-01-15T10:00:00+01:00', 'Asia/Tokyo', 'YYYY-MM-DD HH:mm')
    const source = lines.find(l => l.kind === 'source')
    const utc = lines.find(l => l.kind === 'utc')
    assert.equal(source!.time, '2024-01-15 10:00')
    assert.equal(source!.zone, 'UTC+1')
    assert.equal(utc!.time, '2024-01-15 09:00')
  })

  test('does not repeat a redundant UTC line when the value is already UTC', () => {
    const lines = dateTimeBreakdown(dayjsFactory, '2024-01-15T10:00:00+00:00', 'Asia/Tokyo', 'YYYY-MM-DD HH:mm')
    assert.equal(lines.filter(l => l.kind === 'utc').length, 0)
    const source = lines.find(l => l.kind === 'source')
    assert.equal(source!.zone, 'UTC')
  })
})
