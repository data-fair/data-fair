import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { generateTablePerfCsv, tablePerfColumns, tablePerfDatasetBody, chunkCsv, TABLE_PERF_SEARCH_WORD } from '../../../dev/table-perf-fixture.ts'

const parseLine = (line: string): string[] => {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { cells.push(cur); cur = '' } else cur += c
  }
  cells.push(cur)
  return cells
}

test.describe('table perf fixture generator', () => {
  test('has 50 columns and the requested number of rows', () => {
    assert.equal(tablePerfColumns.length, 50)
    const lines = generateTablePerfCsv(200).trimEnd().split('\n')
    assert.equal(lines.length, 201)
    assert.deepEqual(parseLine(lines[0]), tablePerfColumns.map(c => c.key))
    for (const line of lines.slice(1)) assert.equal(parseLine(line).length, 50)
  })

  test('is deterministic for a given seed and differs across seeds', () => {
    assert.equal(generateTablePerfCsv(100, 7), generateTablePerfCsv(100, 7))
    assert.notEqual(generateTablePerfCsv(100, 7), generateTablePerfCsv(100, 8))
  })

  test('covers the kinds the table renders differently', () => {
    const kinds = new Set(tablePerfColumns.map(c => c.kind))
    for (const k of ['short', 'lowCard', 'long', 'integer', 'decimal', 'date', 'dateTime', 'boolean', 'url', 'multi']) {
      assert.ok(kinds.has(k as any), `missing kind ${k}`)
    }
    const lines = generateTablePerfCsv(500).trimEnd().split('\n').slice(1).map(parseLine)
    const longIdx = tablePerfColumns.findIndex(c => c.kind === 'long')
    assert.ok(lines.every(l => l[longIdx].length >= 200), 'long text values are at least 200 chars')
    const dtIdx = tablePerfColumns.findIndex(c => c.kind === 'dateTime')
    assert.match(lines[0][dtIdx], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/)
  })

  test('the search word is present in some rows but not most', () => {
    const lines = generateTablePerfCsv(1000).trimEnd().split('\n').slice(1)
    const hits = lines.filter(l => l.includes(TABLE_PERF_SEARCH_WORD)).length
    assert.ok(hits > 10 && hits < 300, `hits=${hits}`)
  })

  test('the dataset body is a REST dataset typing every column', () => {
    const body = tablePerfDatasetBody()
    assert.equal(body.isRest, true)
    assert.deepEqual(body.schema.map(p => p.key), tablePerfColumns.map(c => c.key))
    const byKey = Object.fromEntries(body.schema.map(p => [p.key, p]))
    assert.equal(byKey.numero.type, 'integer')
    assert.equal(byKey.prix.type, 'number')
    assert.equal(byKey.actif.type, 'boolean')
    assert.deepEqual([byKey.date_creation.type, byKey.date_creation.format], ['string', 'date'])
    assert.deepEqual([byKey.horodatage.type, byKey.horodatage.format], ['string', 'date-time'])
    assert.equal(byKey.etiquettes.separator, ';')
    assert.equal(byKey.site_web['x-refersTo'], 'https://schema.org/WebPage')
  })

  test('chunkCsv keeps the header in every chunk and stays under the byte limit', () => {
    const csv = generateTablePerfCsv(300)
    const [header, ...rows] = csv.trimEnd().split('\n')
    const chunks = chunkCsv(csv, 20000)
    assert.ok(chunks.length > 1)
    for (const c of chunks) {
      assert.ok(Buffer.byteLength(c) <= 20000, `chunk of ${Buffer.byteLength(c)} bytes`)
      assert.equal(c.split('\n')[0], header)
    }
    assert.deepEqual(chunks.flatMap(c => c.trimEnd().split('\n').slice(1)), rows)
  })
})
