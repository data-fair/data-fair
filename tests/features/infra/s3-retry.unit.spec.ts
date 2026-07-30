import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { retryOnMissing, isMissingError } from '../../../api/src/files-storage/s3-retry.ts'

// Some S3-compatible providers do not guarantee read-after-write consistency
// across distinct connections/processes: an object written by the API process
// can transiently 404 (NoSuchKey) when read moments later by a worker. The AWS
// SDK does not retry 404s, so we absorb these at the application layer.

const noSleep = async () => {}

const missingError = () => {
  const err: any = new Error('The specified key does not exist.')
  err.name = 'NoSuchKey'
  err.$metadata = { httpStatusCode: 404 }
  return err
}

test('isMissingError detects NoSuchKey / NotFound / 404, ignores others', () => {
  assert.ok(isMissingError(missingError()))
  assert.ok(isMissingError({ name: 'NotFound' }))
  assert.ok(isMissingError({ $metadata: { httpStatusCode: 404 } }))
  assert.ok(!isMissingError(new Error('boom')))
  assert.ok(!isMissingError({ $metadata: { httpStatusCode: 500 } }))
  assert.ok(!isMissingError(undefined))
})

test('retryOnMissing returns immediately on success without sleeping', async () => {
  let sleeps = 0
  const res = await retryOnMissing(async () => 'ok', { sleep: async () => { sleeps++ } })
  assert.equal(res, 'ok')
  assert.equal(sleeps, 0)
})

test('retryOnMissing retries transient NoSuchKey then succeeds', async () => {
  let calls = 0
  const sleeps: number[] = []
  const res = await retryOnMissing(async () => {
    calls++
    if (calls < 3) throw missingError()
    return 'ok'
  }, { sleep: async (ms) => { sleeps.push(ms) } })
  assert.equal(res, 'ok')
  assert.equal(calls, 3)
  assert.deepEqual(sleeps, [2000, 4000])
})

test('retryOnMissing gives up after the default attempts (~30s of backoff) and throws the last missing error', async () => {
  let calls = 0
  const sleeps: number[] = []
  await assert.rejects(
    retryOnMissing(async () => { calls++; throw missingError() }, { sleep: async (ms) => { sleeps.push(ms) } }),
    (err: any) => err.name === 'NoSuchKey'
  )
  assert.equal(calls, 5)
  assert.deepEqual(sleeps, [2000, 4000, 8000, 16000])
  assert.equal(sleeps.reduce((a, b) => a + b, 0), 30000)
})

test('retryOnMissing does not retry non-missing errors', async () => {
  let calls = 0
  await assert.rejects(
    retryOnMissing(async () => { calls++; throw new Error('boom') }, { sleep: noSleep }),
    /boom/
  )
  assert.equal(calls, 1)
})

test('retryOnMissing honours a custom attempts count', async () => {
  let calls = 0
  await assert.rejects(
    retryOnMissing(async () => { calls++; throw missingError() }, { attempts: 2, sleep: noSleep }),
    (err: any) => err.name === 'NoSuchKey'
  )
  assert.equal(calls, 2)
})
