import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { WsClient } from '@data-fair/lib-node/ws-client.js'
import { axiosAuth, clean, wsUrl } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// The progress of the index task, as published on the task-progress websocket channel (which
// is exactly what the UI progress bar renders). The task reports the documents acknowledged
// by ES, and a real percentage whenever the total is honestly knowable before the stream runs:
// REST datasets count their mongo collection, a re-index of unchanged data reuses the count
// written by the previous run. A first indexing of a file has no honest total (the reader
// outruns ES by the whole pipeline buffering) and stays on an indeterminate bar.

const log = { info: async () => {}, error: console.error, debug: () => {} }
const ws = new WsClient({ url: wsUrl, log: log as any })
test.afterAll(() => ws.close())

// collect every message of the channel until the terminal clearTaskProgress (an empty object
// published when the finalize task ends). Subscribe separately BEFORE triggering the work.
const collectUntilCleared = (channel: string, timeout = 30000): Promise<any[]> => {
  const messages: any[] = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', cb)
      reject(new Error(`timeout collecting ${channel}, got ${JSON.stringify(messages)}`))
    }, timeout)
    const cb = (message: any) => {
      if (message.channel !== channel || message.type !== 'message') return
      messages.push(message.data)
      if (!message.data?.task) {
        clearTimeout(timer)
        ws.off('message', cb)
        resolve(messages)
      }
    }
    ws.on('message', cb)
  })
}

const uploadCsv = async (csv: string) => {
  const form = new FormData()
  form.append('file', Buffer.from(csv), 'data.csv')
  return (await testUser1.post('/api/v1/datasets', form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })).data
}

test.describe('index task progress', () => {
  test.beforeEach(async () => { await clean() })

  test('a first file indexing reports acknowledged documents on an indeterminate bar with named steps', async () => {
    const csv = 'a,b\n' + Array.from({ length: 300 }, (_, i) => `v${i},${i}`).join('\n') + '\n'
    const ds = await uploadCsv(csv)
    // subscribing right after the POST: the index task runs several tasks later, the
    // subscription (a websocket roundtrip) always beats it
    await ws.subscribe(`datasets/${ds.id}/task-progress`)
    const messages = await collectUntilCleared(`datasets/${ds.id}/task-progress`)

    const index = messages.filter(m => m.task === 'index')
    const indexing = index.filter(m => m.step === 'indexing')
    assert.ok(indexing.length >= 1, `expected indexing messages, got ${JSON.stringify(messages)}`)
    for (const m of indexing) {
      assert.equal(m.progress, -1, `no honest percentage exists for a first file indexing, got ${JSON.stringify(m)}`)
      assert.equal(typeof m.count, 'number')
    }
    const steps = index.map(m => m.step)
    for (const step of ['start', 'refresh', 'switchAlias']) {
      assert.ok(steps.includes(step), `expected step ${step}, got ${JSON.stringify(steps)}`)
    }
  })

  test('re-indexing unchanged data reports a real percentage from the previous count', async () => {
    const csv = 'a,b\n' + Array.from({ length: 300 }, (_, i) => `v${i},${i}`).join('\n') + '\n'
    const ds = await uploadCsv(csv)
    await waitForFinalize(testUser1, ds.id)

    // a constraints-only patch triggers a full re-index of the very same file
    await ws.subscribe(`datasets/${ds.id}/task-progress`)
    const collected = collectUntilCleared(`datasets/${ds.id}/task-progress`)
    await testUser1.patch(`/api/v1/datasets/${ds.id}`, { constraints: [{ type: 'unique', properties: ['a'] }] })
    const messages = await collected

    const indexing = messages.filter(m => m.task === 'index' && m.step === 'indexing')
    assert.ok(indexing.length >= 1, `expected indexing messages, got ${JSON.stringify(messages)}`)
    const percents = indexing.map(m => m.progress).filter(p => p !== -1)
    assert.ok(percents.length >= 1, `expected determinate percentages, got ${JSON.stringify(indexing)}`)
    for (let i = 0; i < percents.length; i++) {
      assert.ok(percents[i] >= 0 && percents[i] <= 100)
      if (i > 0) assert.ok(percents[i] >= percents[i - 1], `receding bar: ${JSON.stringify(percents)}`)
    }
  })

  test('indexing a REST dataset reports a real percentage from the collection count', async () => {
    const ds = (await testUser1.post('/api/v1/datasets/idxprogrest', {
      isRest: true,
      title: 'idxprogrest',
      schema: [{ key: 'a', type: 'string' }]
    })).data
    // the creation runs its own pipeline; wait for it so the collection below only sees the
    // cycle triggered by the bulk write (REST tasks are quasi-synchronous: poll, don't listen)
    for (let i = 0; (await testUser1.get(`/api/v1/datasets/${ds.id}`)).data.status !== 'finalized'; i++) {
      if (i > 100) throw new Error('timeout waiting for REST dataset creation')
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await ws.subscribe(`datasets/${ds.id}/task-progress`)
    const collected = collectUntilCleared(`datasets/${ds.id}/task-progress`)
    // async=true forces the worker path: small bulks are otherwise indexed inline in the
    // HTTP request (commitLines) without ever running the index task
    await testUser1.post(`/api/v1/datasets/${ds.id}/_bulk_lines`, Array.from({ length: 250 }, (_, i) => ({ a: 'line' + i })), { params: { async: 'true' } })
    const messages = await collected

    const indexing = messages.filter(m => m.task === 'index' && m.step === 'indexing')
    assert.ok(indexing.length >= 1, `expected indexing messages, got ${JSON.stringify(messages)}`)
    const percents = indexing.map(m => m.progress).filter(p => p !== -1)
    assert.ok(percents.length >= 1, `expected determinate percentages, got ${JSON.stringify(indexing)}`)
    for (let i = 0; i < percents.length; i++) {
      assert.ok(percents[i] >= 0 && percents[i] <= 100)
      if (i > 0) assert.ok(percents[i] >= percents[i - 1], `receding bar: ${JSON.stringify(percents)}`)
    }
  })
})
