import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import { computeDueMilestones } from '../../../api/src/settings/api-keys-expiration-milestones.ts'

const NOW = '2026-06-02'
const plus = (n: number) => dayjs(NOW).add(n, 'day').format('YYYY-MM-DD')

test.describe('computeDueMilestones', () => {
  test('no expireAt -> nothing', () => {
    assert.deepEqual(computeDueMilestones({}, NOW), [])
  })

  test('expires in 3 days -> only expiring', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(3) }, NOW), ['expiring'])
  })

  test('expires in 4 days -> nothing (just outside the window)', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(4) }, NOW), [])
  })

  test('expires in 1 day -> only expiring', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(1) }, NOW), ['expiring'])
  })

  test('expires today -> only expired (anti-spam: no expiring)', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: NOW }, NOW), ['expired'])
  })

  test('already expired (yesterday) -> nothing (we never notify the past)', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(-1) }, NOW), [])
  })

  test('expired long ago -> nothing', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(-30) }, NOW), [])
  })

  test('expires in 10 days -> nothing', () => {
    assert.deepEqual(computeDueMilestones({ expireAt: plus(10) }, NOW), [])
  })

  test('expiring already notified -> nothing', () => {
    assert.deepEqual(
      computeDueMilestones({ expireAt: plus(2), notifiedJ3At: '2026-06-01T03:00:00.000Z' }, NOW),
      []
    )
  })

  test('expires today but day-of already notified -> nothing', () => {
    assert.deepEqual(
      computeDueMilestones({ expireAt: NOW, notifiedJAt: '2026-06-02T03:00:00.000Z' }, NOW),
      []
    )
  })

  test('expiring notified but now also expired -> expired only', () => {
    assert.deepEqual(
      computeDueMilestones({ expireAt: NOW, notifiedJ3At: '2026-05-30T03:00:00.000Z' }, NOW),
      ['expired']
    )
  })
})
