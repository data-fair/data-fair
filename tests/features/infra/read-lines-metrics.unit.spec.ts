import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import client from 'prom-client'
import { readLinesStart, readLinesMode } from '../../../api/src/misc/utils/observe.ts'

const fakeRes = (statusCode: number, contentLength?: number) => {
  const res: any = new EventEmitter()
  res.statusCode = statusCode
  res.getHeader = (n: string) => (n === 'content-length' ? contentLength : undefined)
  return res
}

test.describe('readLines usage metrics', () => {
  test('counts requests by format/mode/status and observes body bytes on finish', async () => {
    const req: any = { query: { format: 'csv' } }
    const res = fakeRes(200, 1234)
    readLinesStart(req, res)
    readLinesMode(req, 'streamed')
    res.emit('finish')

    const reqPbf: any = { query: { format: 'mvt' } } // mvt/vt/pbf normalize to 'pbf'
    const resPbf = fakeRes(204) // empty tile: counted, but no size observed (no content-length)
    readLinesStart(reqPbf, resPbf)
    readLinesMode(reqPbf, 'raw-worker')
    resPbf.emit('finish')

    const reqErr: any = { query: {} } // no format → json; mode never upgraded → buffered
    const resErr = fakeRes(400)
    readLinesStart(reqErr, resErr)
    resErr.emit('finish')

    const total = await client.register.getSingleMetric('df_read_lines_total')!.get()
    const count = (labels: Record<string, string>) =>
      total.values.find(v => Object.entries(labels).every(([k, val]) => (v.labels as any)[k] === val))?.value
    assert.equal(count({ format: 'csv', mode: 'streamed', status: '2xx' }), 1)
    assert.equal(count({ format: 'pbf', mode: 'raw-worker', status: '2xx' }), 1)
    assert.equal(count({ format: 'json', mode: 'buffered', status: '4xx' }), 1)

    const bytes = await client.register.getSingleMetric('df_read_lines_bytes')!.get()
    const csvSum = bytes.values.find(v =>
      (v as any).metricName === 'df_read_lines_bytes_sum' && (v.labels as any).format === 'csv' && (v.labels as any).mode === 'streamed')
    assert.equal(csvSum?.value, 1234)
    const pbfSeries = bytes.values.find(v => (v.labels as any).format === 'pbf')
    assert.equal(pbfSeries, undefined, 'a bodyless 204 must not observe a size')
  })
})
