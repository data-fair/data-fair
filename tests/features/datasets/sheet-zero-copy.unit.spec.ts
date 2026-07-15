import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// Row-identity gate for the zero-copy xlsx/ods path. OLD: read.ts prepared rows on the main thread from
// search()'s esResponse, whose _attachment_url was already rewritten (ctx.rewriteAttachmentUrl unset).
// NEW: the sheet worker prepares rows from the RAW hits with ctx.rewriteAttachmentUrl = true — the same
// shared rewriteAttachmentUrl function, so both modes MUST produce identical rows (the contract the
// streamed json/csv/geojson modes already rely on). The workbook build downstream is unchanged, so row
// identity == sheet identity (xlsx bytes themselves embed timestamps and are not comparable).
//
// commons.ts imports #config: point node-config at the real api/config dir and dynamic-import AFTER —
// same pattern as lines-stream-parity.unit.spec.ts.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const dataset: any = {
  id: 'sheet-ds',
  slug: 'sheet-ds',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  schema: [
    { key: '_id', type: 'string' },
    { key: 'label', type: 'string' },
    { key: 'n', type: 'integer' },
    { key: 'when', type: 'string', format: 'date-time' },
    { key: 'tags', type: 'string', separator: ',' },
    { key: '_attachment_url', type: 'string', 'x-calculated': true }
  ]
}

const publicBaseUrl = 'https://portal.example.com/data-fair'

const makeHits = (rawAttachmentUrl: string) => ([
  { _id: 'a', _score: null, sort: [0], _source: { label: 'plain', n: 1, when: '2024-05-01T10:00:00+02:00', tags: ['x', 'y'] } },
  { _id: 'b', _score: null, sort: [1], _source: { label: 'with attachment', n: 2, _attachment_url: rawAttachmentUrl } },
  { _id: 'c', _score: null, sort: [2], _source: { label: 'empty-ish' } }
])

test.describe('zero-copy sheet export row identity', () => {
  test('in-worker prepared rows (raw hits + rewrite flag) equal main-thread rows (pre-rewritten hits)', async () => {
    const { prepareResultItem, prepareResultContext, rewriteAttachmentUrl } = await import('../../../api/src/datasets/es/commons.ts')
    const { getFlatten } = await import('../../../api/src/datasets/utils/flatten.ts')
    const config = (await import('config')).default as any
    const rawAttachmentUrl = `${config.publicUrl}/api/v1/datasets/sheet-ds/attachments/doc.pdf`
    const query: any = { select: 'label,n,when,tags,_attachment_url' }
    const flatten = getFlatten(dataset, false)

    // OLD main-thread path: search() rewrote the raw stored URL in place, ctx flag unset
    const oldHits = makeHits(rawAttachmentUrl)
    for (const hit of oldHits) {
      if (hit._source._attachment_url) hit._source._attachment_url = rewriteAttachmentUrl(hit._source._attachment_url, dataset, publicBaseUrl)
    }
    const oldCtx = prepareResultContext(dataset, query)
    const oldRows = oldHits.map(hit => prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, oldCtx))

    // NEW in-worker path: raw hits straight from the parsed buffer, rewrite done by prepareResultItem
    const rawHits = JSON.parse(JSON.stringify(makeHits(rawAttachmentUrl)))
    const newCtx = prepareResultContext(dataset, query)
    newCtx.rewriteAttachmentUrl = true
    const newRows = rawHits.map((hit: any) => prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, newCtx))

    assert.deepEqual(newRows, oldRows)
    assert.ok(JSON.stringify(oldRows).includes(publicBaseUrl), 'attachment url must be rewritten to the public base url')
  })
})
