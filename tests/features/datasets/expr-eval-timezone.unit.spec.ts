import { test } from '@playwright/test'
import assert from 'node:assert/strict'
// @ts-ignore -- shared module
import exprEvalFactory from '../../../shared/expr-eval.js'

// The factory's `defaultTimezone` argument is the fallback zone for every date function.
// When it is missing, dayjs silently falls back to the *process* timezone, so a mis-wired
// caller produces wrong-but-plausible dates instead of an error — which is exactly how
// `config.defaultTimezone` (a typo for `defaultTimeZone`, hence undefined) went unnoticed
// in the API's extensions module. The factory now refuses a missing zone.
test.describe('expr-eval default timezone', () => {
  test('the factory refuses a missing default timezone', () => {
    assert.throws(() => exprEvalFactory(undefined), /defaultTimezone is required/)
    assert.throws(() => exprEvalFactory(''), /defaultTimezone is required/)
  })

  test('TRANSFORM_DATE interprets a zone-less date in the default timezone', () => {
    // Two zones chosen far apart and far from any plausible CI/dev zone, so the
    // assertion holds whatever the machine running the test is set to.
    const compileIn = (timeZone: string) =>
      exprEvalFactory(timeZone).compile('TRANSFORM_DATE(date, "YYYY-MM-DD HH:mm", "X")', { type: 'string' })

    const line = { date: '2024-01-15 12:00' }
    const utcPlus14 = compileIn('Pacific/Kiritimati')(line)
    const utcMinus11 = compileIn('Pacific/Niue')(line)

    // Same wall-clock reading, 25 hours apart once each is anchored to its own zone.
    assert.equal(utcMinus11 - utcPlus14, 25 * 3600)
  })
})
