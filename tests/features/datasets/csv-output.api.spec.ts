import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const BOM = '﻿'

// Helper: create a REST dataset with the given schema, post the given lines,
// wait for indexing, and return the dataset id. _id is forced so the line
// ordering is deterministic when we sort by _id later.
const seedRestDataset = async (ax: any, id: string, schema: any[], lines: any[]) => {
  await ax.post('/api/v1/datasets/' + id, { isRest: true, title: id, schema })
  for (const line of lines) {
    const res = await ax.post(`/api/v1/datasets/${id}/lines`, line)
    // POST /lines returns 200 when _id is provided, 201 when generated
    assert.ok(res.status === 200 || res.status === 201, `POST /lines returned ${res.status}`)
  }
  await waitForFinalize(ax, id)
  return id
}

const csvBody = async (ax: any, id: string, qs = '') => {
  // sort by _id so output ordering is deterministic across runs
  const url = `/api/v1/datasets/${id}/lines?format=csv&sort=_id${qs ? '&' + qs : ''}`
  // arraybuffer preserves the BOM; axios' text decoder strips it
  const res = await ax.get(url, { responseType: 'arraybuffer' })
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8')
  return Buffer.from(res.data).toString('utf8')
}

// Better diff than assert.equal for opaque/unicode strings
const assertEqualBodies = (actual: string, expected: string) => {
  if (actual === expected) return
  const hex = (s: string) => [...s].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ')
  assert.fail(
    'bodies differ\n' +
    `--- actual (${actual.length} chars) ---\n${JSON.stringify(actual)}\n` +
    `--- expected (${expected.length} chars) ---\n${JSON.stringify(expected)}\n` +
    `--- actual hex   ---\n${hex(actual)}\n` +
    `--- expected hex ---\n${hex(expected)}`
  )
}

test.describe('CSV output (JIT serializer end-to-end)', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('all primitive types: string/integer/number/boolean, plus null cells', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvtypes', [
      { key: 'name', type: 'string' },
      { key: 'qty', type: 'integer' },
      { key: 'price', type: 'number' },
      { key: 'active', type: 'boolean' }
    ], [
      { _id: 'a', name: 'alice', qty: 30, price: 9.99, active: true },
      { _id: 'b', name: 'bob', qty: 0, price: 0, active: false },
      // omitted fields → null cells
      { _id: 'c', name: 'carol' }
    ])

    const csv = await csvBody(ax, id)
    const expected =
      BOM + '"name","qty","price","active"\n' +
      '"alice",30,9.99,1\n' +
      '"bob",0,0,0\n' +
      '"carol",,,\n'
    assertEqualBodies(csv, expected)
  })

  test('strings with CSV-significant chars: comma, quote, newline, CRLF', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvquotes', [{ key: 's', type: 'string' }], [
      { _id: '1', s: 'plain' },
      { _id: '2', s: 'has,comma' },
      { _id: '3', s: 'has "quote"' },
      { _id: '4', s: 'has\nlinefeed' },
      { _id: '5', s: 'has\r\ncrlf' },
      { _id: '6', s: 'mixed, "quoted"\nand newline' }
    ])

    const csv = await csvBody(ax, id)
    const expected =
      BOM + '"s"\n' +
      '"plain"\n' +
      '"has,comma"\n' +
      '"has ""quote"""\n' +
      '"has\nlinefeed"\n' +
      '"has\r\ncrlf"\n' +
      '"mixed, ""quoted""\nand newline"\n'
    assertEqualBodies(csv, expected)
  })

  test('null character in string values is stripped from CSV output', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvnullchar', [{ key: 's', type: 'string' }], [
      { _id: '1', s: 'before\0after' },
      { _id: '2', s: '\0\0just nulls\0\0' },
      { _id: '3', s: 'clean' }
    ])

    const csv = await csvBody(ax, id)
    const expected =
      BOM + '"s"\n' +
      '"beforeafter"\n' +
      '"just nulls"\n' +
      '"clean"\n'
    assertEqualBodies(csv, expected)
  })

  test('custom separator: ?sep=; with values containing both , and ;', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvsep', [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'string' }
    ], [
      { _id: '1', a: 'has,comma', b: 'has;semicolon' },
      { _id: '2', a: 'both, and;', b: 'plain' }
    ])

    const csv = await csvBody(ax, id, 'sep=;')
    const expected =
      BOM + '"a";"b"\n' +
      '"has,comma";"has;semicolon"\n' +
      '"both, and;";"plain"\n'
    assertEqualBodies(csv, expected)
  })

  test('?header=false suppresses the header row but keeps the BOM', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvnoheader', [{ key: 's', type: 'string' }], [
      { _id: '1', s: 'one' },
      { _id: '2', s: 'two' }
    ])

    const csv = await csvBody(ax, id, 'header=false')
    const expected = BOM + '"one"\n' + '"two"\n'
    assertEqualBodies(csv, expected)
  })

  test('?select= controls column subset and ordering', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvselect', [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'string' },
      { key: 'c', type: 'string' }
    ], [
      { _id: '1', a: 'A1', b: 'B1', c: 'C1' },
      { _id: '2', a: 'A2', b: 'B2', c: 'C2' }
    ])

    // request c then a (reversed/subset)
    const csv = await csvBody(ax, id, 'select=c,a')
    const expected =
      BOM + '"c","a"\n' +
      '"C1","A1"\n' +
      '"C2","A2"\n'
    assertEqualBodies(csv, expected)
  })

  test('unicode (BMP + emoji) survives round-trip unchanged', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvunicode', [{ key: 's', type: 'string' }], [
      { _id: '1', s: 'éàü' },
      { _id: '2', s: '中文' },
      { _id: '3', s: '🚀' },
      { _id: '4', s: 'mixed éàü 中文 🚀' }
    ])

    const csv = await csvBody(ax, id)
    const expected =
      BOM + '"s"\n' +
      '"éàü"\n' +
      '"中文"\n' +
      '"🚀"\n' +
      '"mixed éàü 中文 🚀"\n'
    assertEqualBodies(csv, expected)
  })

  test('empty result set still emits BOM + header row', async () => {
    const ax = testUser1
    const id = await seedRestDataset(ax, 'csvempty', [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'integer' }
    ], [
      { _id: '1', a: 'x', b: 1 }
    ])

    // filter that matches no rows
    const csv = await csvBody(ax, id, 'a_eq=nonexistent')
    const expected = BOM + '"a","b"\n'
    assertEqualBodies(csv, expected)
  })

  test('streaming path (/raw) on REST dataset produces same CSV', async () => {
    // /raw on REST datasets is gated to superadmin and exercises csvStreams
    // (Transform pipeline) instead of results2csv. Same compiled function,
    // different runtime entry — worth covering.
    const ax = testUser1
    const id = 'csvstream'
    await seedRestDataset(ax, id, [
      { key: 's', type: 'string' },
      { key: 'n', type: 'integer' },
      { key: 'b', type: 'boolean' }
    ], [
      { _id: '1', s: 'has,comma', n: 42, b: true },
      { _id: '2', s: 'has "quote"', n: 0, b: false },
      { _id: '3', s: 'plain', n: -1, b: null }
    ])

    const res = await testSuperadmin.get(`/api/v1/datasets/${id}/raw?sort=_id`, {
      responseType: 'arraybuffer'
    })
    assert.equal(res.status, 200)
    const csv = Buffer.from(res.data).toString('utf8')
    // /raw forces an _id column at the start in the router. Compare the body
    // row count + tail of each row so the test isn't tied to the _id values.
    const lines = csv.split('\n')
    assert.equal(lines[0], BOM + '"_id","s","n","b"')
    assert.ok(lines[1].endsWith(',"has,comma",42,1'))
    assert.ok(lines[2].endsWith(',"has ""quote""",0,0'))
    assert.ok(lines[3].endsWith(',"plain",-1,'))
    assert.equal(lines[4], '') // trailing newline
  })
})
