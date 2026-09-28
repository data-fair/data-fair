import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { dateCoherenceProps, dateCoherenceViolation } from '../../../api/src/datasets/utils/constraints.ts'

const dateProp = (key: string, concept: string, extra: any = {}) =>
  ({ key, type: 'string', format: 'date', 'x-refersTo': concept, ...extra })
const dateTimeProp = (key: string, concept: string, extra: any = {}) =>
  ({ key, type: 'string', format: 'date-time', 'x-refersTo': concept, ...extra })

const START = 'https://schema.org/startDate'
const END = 'https://schema.org/endDate'
const TZ = 'Europe/Paris'

test.describe('dateCoherenceProps', () => {
  test('resolves both concept columns', () => {
    const r = dateCoherenceProps([dateProp('deb', START), dateProp('fin', END), { key: 'x', type: 'string' }])
    assert.equal(r?.startProp.key, 'deb')
    assert.equal(r?.endProp.key, 'fin')
  })
  test('returns null when a concept is missing', () => {
    assert.equal(dateCoherenceProps([dateProp('deb', START)]), null)
    assert.equal(dateCoherenceProps([]), null)
  })
})

test.describe('dateCoherenceViolation', () => {
  const s = dateProp('deb', START, { title: 'Début' })
  const e = dateProp('fin', END, { title: 'Fin' })
  const sdt = dateTimeProp('deb', START)
  const edt = dateTimeProp('fin', END)

  test('date/date: end before start is a violation, message names titles and values', () => {
    const msg = dateCoherenceViolation('2024-05-02', '2024-05-01', s, e, TZ)
    assert.ok(msg)
    assert.match(msg!, /Fin/)
    assert.match(msg!, /Début/)
    assert.match(msg!, /2024-05-01/)
    assert.match(msg!, /2024-05-02/)
  })
  test('date/date: end after start passes', () => {
    assert.equal(dateCoherenceViolation('2024-05-01', '2024-05-02', s, e, TZ), null)
  })
  test('equality passes (end >= start)', () => {
    assert.equal(dateCoherenceViolation('2024-05-01', '2024-05-01', s, e, TZ), null)
    assert.equal(dateCoherenceViolation('2024-05-01T10:00:00+02:00', '2024-05-01T10:00:00+02:00', sdt, edt, TZ), null)
  })
  test('missing either value passes (open-ended periods)', () => {
    assert.equal(dateCoherenceViolation(undefined, '2024-05-01', s, e, TZ), null)
    assert.equal(dateCoherenceViolation('2024-05-01', undefined, s, e, TZ), null)
    assert.equal(dateCoherenceViolation('', '', s, e, TZ), null)
    assert.equal(dateCoherenceViolation(null, null, s, e, TZ), null)
  })
  test('unparseable values pass (schema validation reports them, no double report)', () => {
    assert.equal(dateCoherenceViolation('not-a-date', '2024-05-01', s, e, TZ), null)
    assert.equal(dateCoherenceViolation('2024-05-01', 'not-a-date', s, e, TZ), null)
  })
  test('date-time/date-time: instant comparison honours offsets', () => {
    // 10:00+02:00 === 08:00Z — end at 07:59Z is before start
    assert.ok(dateCoherenceViolation('2024-05-01T10:00:00+02:00', '2024-05-01T07:59:00Z', sdt, edt, TZ))
    assert.equal(dateCoherenceViolation('2024-05-01T10:00:00+02:00', '2024-05-01T08:00:00Z', sdt, edt, TZ), null)
  })
  test('mixed: bare end date expands to end-of-day (any same-day overlap passes)', () => {
    // start 23:00 Paris on the 1st, end (date) on the 1st: end-of-day 23:59:59.999 Paris >= start
    assert.equal(dateCoherenceViolation('2024-05-01T23:00:00+02:00', '2024-05-01', sdt, e, TZ), null)
    // end (date) on the day BEFORE the start instant is a violation
    assert.ok(dateCoherenceViolation('2024-05-01T10:00:00+02:00', '2024-04-30', sdt, e, TZ))
  })
  test('mixed: bare start date expands to start-of-day in the field timezone', () => {
    // start (date) 2024-05-01 → 2024-05-01T00:00+02:00 Paris = 2024-04-30T22:00Z
    // end 2024-04-30T22:00:00Z equals it exactly — passes
    assert.equal(dateCoherenceViolation('2024-05-01', '2024-04-30T22:00:00Z', s, edt, TZ), null)
    // one millisecond earlier fails
    assert.ok(dateCoherenceViolation('2024-05-01', '2024-04-30T21:59:59Z', s, edt, TZ))
  })
  test('mixed: per-field timeZone overrides the default', () => {
    const sTz = dateProp('deb', START, { timeZone: 'Pacific/Honolulu' }) // UTC-10
    // start-of-day 2024-05-01 in Honolulu = 2024-05-01T10:00Z
    assert.equal(dateCoherenceViolation('2024-05-01', '2024-05-01T10:00:00Z', sTz, edt, TZ), null)
    assert.ok(dateCoherenceViolation('2024-05-01', '2024-05-01T09:59:00Z', sTz, edt, TZ))
  })

  test('date-time without offset is interpreted in the field timezone, not UTC', () => {
    // start 2024-05-01T01:00:00 means 01:00 Paris (CEST, UTC+2) = 2024-04-30T23:00:00Z
    // end 2024-05-01T00:30:00Z = 2024-05-01T00:30:00Z, which is after the start instant
    // an offset-less start naively read as UTC (the pre-fix behavior) would be
    // 2024-05-01T01:00:00Z, AFTER the end instant, and wrongly flagged as a violation
    assert.equal(dateCoherenceViolation('2024-05-01T01:00:00', '2024-05-01T00:30:00Z', sdt, edt, TZ), null)
    // and the reverse (end genuinely before start once both are read in the field tz) still violates
    assert.ok(dateCoherenceViolation('2024-05-01T01:00:00', '2024-04-30T20:00:00Z', sdt, edt, TZ))
  })

  test('date-time without offset honours a per-field timeZone override', () => {
    const sHnl = dateTimeProp('deb', START, { timeZone: 'Pacific/Honolulu' }) // UTC-10
    // 2024-05-01T00:30:00 in Honolulu = 2024-05-01T10:30:00Z, after the Z-tagged end below
    assert.ok(dateCoherenceViolation('2024-05-01T00:30:00', '2024-05-01T10:00:00Z', sHnl, edt, TZ))
    // one instant later on the end side and it passes
    assert.equal(dateCoherenceViolation('2024-05-01T00:30:00', '2024-05-01T10:30:00Z', sHnl, edt, TZ), null)
  })

  test('date-time with an explicit offset (including "Z") is unaffected by the field timezone', () => {
    // both values carry "Z" — must be read as UTC regardless of the Honolulu field timeZone
    const sHnl = dateTimeProp('deb', START, { timeZone: 'Pacific/Honolulu' })
    assert.equal(dateCoherenceViolation('2024-05-01T10:00:00Z', '2024-05-01T10:00:00Z', sHnl, edt, TZ), null)
    assert.ok(dateCoherenceViolation('2024-05-01T10:00:00Z', '2024-05-01T09:59:00Z', sHnl, edt, TZ))
    // a non-Z explicit offset is likewise preserved as-is
    assert.equal(dateCoherenceViolation('2024-05-01T10:00:00+02:00', '2024-05-01T08:00:00Z', sdt, edt, TZ), null)
  })
})
