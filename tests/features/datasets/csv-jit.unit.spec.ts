import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { stringify as csvStrSync } from 'csv-stringify/sync'
import { getCsvSerializer, compileCsvNoCache } from '../../../api/src/datasets/utils/csv-jit.ts'

// The JIT CSV serializer must produce byte-identical output to the
// csv-stringify configuration historically used by results2csv / csvStreams
// (see api/src/datasets/utils/outputs.js for the pre-migration options).

const referenceCsv = (rows: any[], columns: { key: string; header: string }[], opts: { bom?: boolean; header?: boolean; delimiter?: string } = {}) => {
  const out = csvStrSync(rows, {
    bom: opts.bom ?? true,
    columns,
    header: opts.header ?? true,
    quoted_string: true,
    delimiter: opts.delimiter ?? ',',
    cast: {
      boolean: (value: any) => {
        if (value === true) return '1'
        if (value === false) return '0'
        return ''
      }
    }
  })
  // outputs.js used to do this post-processing — we replicate it so the
  // reference matches what callers actually observed.
  return out.replace(/\0/g, '')
}

const jitCsv = (rows: any[], columns: { key: string; header: string }[], opts: { bom?: boolean; header?: boolean; delimiter?: string } = {}) => {
  const { prologue, row } = compileCsvNoCache(columns, opts)
  let s = prologue
  for (const r of rows) s += row(r)
  return s
}

const assertEqual = (rows: any[], columns: { key: string; header: string }[], opts: any = {}, label = '') => {
  const ref = referenceCsv(rows, columns, opts)
  const jit = jitCsv(rows, columns, opts)
  if (ref !== jit) {
    // print a small diff for debuggability
    const refLines = ref.split('\n')
    const jitLines = jit.split('\n')
    const diff: string[] = []
    for (let i = 0; i < Math.max(refLines.length, jitLines.length); i++) {
      if (refLines[i] !== jitLines[i]) {
        diff.push(`line ${i}:`)
        diff.push(`  ref: ${JSON.stringify(refLines[i])}`)
        diff.push(`  jit: ${JSON.stringify(jitLines[i])}`)
        if (diff.length > 30) break
      }
    }
    assert.fail(`${label}\n${diff.join('\n')}\n--- full ref ---\n${ref}\n--- full jit ---\n${jit}`)
  }
}

test.describe('csv-jit byte-equivalence with csv-stringify', () => {
  test('simple types: string, number, integer, boolean', () => {
    const columns = [
      { key: 'name', header: 'Name' },
      { key: 'age', header: 'Age' },
      { key: 'price', header: 'Price' },
      { key: 'active', header: 'Active' }
    ]
    const rows = [
      { name: 'alice', age: 30, price: 9.99, active: true },
      { name: 'bob', age: 0, price: 0, active: false },
      { name: '', age: -1, price: -0.5, active: true }
    ]
    assertEqual(rows, columns)
  })

  test('null and undefined produce empty cells', () => {
    const columns = [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
      { key: 'c', header: 'C' }
    ]
    const rows = [
      { a: 'x', b: null, c: undefined },
      { a: null, b: undefined, c: 'z' },
      { a: undefined, b: 'y', c: null },
      {}
    ]
    assertEqual(rows, columns)
  })

  test('strings with quotes, commas, newlines', () => {
    const columns = [{ key: 's', header: 'S' }]
    const rows = [
      { s: 'plain' },
      { s: 'has "double" quotes' },
      { s: 'has,comma' },
      { s: 'has\nnewline' },
      { s: 'has\r\ncrlf' },
      { s: 'mixed, "quoted"\nand newline' },
      { s: '"' },
      { s: '""' },
      { s: ',' },
      { s: '\n' }
    ]
    assertEqual(rows, columns)
  })

  test('strip null character from string values', () => {
    const columns = [{ key: 's', header: 'S' }]
    const rows = [
      { s: 'a\0b' },
      { s: '\0\0\0' },
      { s: 'no null' },
      { s: '\0' }
    ]
    assertEqual(rows, columns)
  })

  test('unicode and BMP-spanning characters', () => {
    const columns = [{ key: 's', header: 'S' }]
    const rows = [
      { s: 'éàü' },
      { s: '中文' },
      { s: '🚀' },
      { s: 'mixed éàü 中文 🚀' }
    ]
    assertEqual(rows, columns)
  })

  test('custom delimiter (semicolon)', () => {
    const columns = [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' }
    ]
    const rows = [
      { a: 'has;semi', b: 'plain' },
      { a: 'has,comma', b: 'has;semi too' }
    ]
    assertEqual(rows, columns, { delimiter: ';' })
  })

  test('bom: false', () => {
    const columns = [{ key: 'a', header: 'A' }]
    const rows = [{ a: 'x' }]
    assertEqual(rows, columns, { bom: false })
  })

  test('header: false', () => {
    const columns = [{ key: 'a', header: 'A' }]
    const rows = [{ a: 'x' }, { a: 'y' }]
    assertEqual(rows, columns, { header: false })
  })

  test('empty result set still emits BOM + header', () => {
    const columns = [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }]
    assertEqual([], columns)
  })

  test('header text with special chars (delimiter, quote, newline)', () => {
    const columns = [
      { key: 'a', header: 'has,comma' },
      { key: 'b', header: 'has "quote"' },
      { key: 'c', header: 'has\nnewline' }
    ]
    assertEqual([{ a: 1, b: 2, c: 3 }], columns)
  })

  test('object values get JSON.stringify treatment (matches default cast.object)', () => {
    const columns = [{ key: 'g', header: 'G' }]
    const rows = [
      { g: { type: 'Point', coordinates: [1, 2] } },
      { g: [1, 2, 3] },
      { g: { a: 'has,comma' } },
      { g: { a: 'has "quote"' } }
    ]
    assertEqual(rows, columns)
  })

  test('bigint values cast to plain digits', () => {
    const columns = [{ key: 'n', header: 'N' }]
    const rows = [
      { n: 123456789012345678901234567890n },
      { n: 0n },
      { n: -1n }
    ]
    assertEqual(rows, columns)
  })

  test('Date instances cast to epoch milliseconds (matches default cast.date)', () => {
    const columns = [{ key: 'd', header: 'D' }]
    const rows = [
      { d: new Date('2026-05-18T10:23:45.123Z') },
      { d: new Date(0) }
    ]
    assertEqual(rows, columns)
  })

  test('mismatched value types still match csv-stringify behavior', () => {
    // schema says one thing but value is something else; csv-stringify
    // dispatches on the runtime JS type, so we must too.
    const columns = [
      { key: 'n', header: 'N' },
      { key: 's', header: 'S' }
    ]
    const rows = [
      { n: 'forty-two', s: 42 },          // string in number col, number in string col
      { n: true, s: false },              // booleans
      { n: { x: 1 }, s: [1, 2] },         // objects/arrays
      { n: null, s: undefined }
    ]
    assertEqual(rows, columns)
  })

  // -------- randomised fuzz test --------
  // Generates many random schemas + rows; this is the real safety net for
  // edge cases I haven't enumerated above.

  const rand = (() => {
    let s = 1
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
  })()

  const randomString = (n: number) => {
    const alphabet = 'abc, "\n\r\0\\\tABCéü中🚀'
    let s = ''
    for (let i = 0; i < n; i++) s += alphabet[(rand() * alphabet.length) | 0]
    return s
  }

  const randomValue = () => {
    const r = rand()
    if (r < 0.15) return null
    if (r < 0.25) return undefined
    if (r < 0.40) return ''
    if (r < 0.55) return randomString(((rand() * 30) | 0) + 1)
    if (r < 0.65) return (rand() * 1000 - 500) | 0
    if (r < 0.75) return (rand() - 0.5) * 1000
    if (r < 0.82) return rand() < 0.5
    if (r < 0.88) return { type: 'Point', coordinates: [rand(), rand()] }
    if (r < 0.92) return [1, 'two', null, false]
    if (r < 0.96) return BigInt(Math.floor(rand() * 1e9))
    return new Date(Math.floor(rand() * 1e12))
  }

  for (let seed = 0; seed < 10; seed++) {
    test(`fuzz: random schema + 50 rows (seed ${seed})`, () => {
      const colCount = 3 + ((rand() * 8) | 0)
      const columns: { key: string; header: string }[] = []
      for (let i = 0; i < colCount; i++) {
        columns.push({ key: `col_${i}`, header: randomString(((rand() * 8) | 0) + 1) || `H${i}` })
      }
      const rows: any[] = []
      for (let r = 0; r < 50; r++) {
        const row: Record<string, any> = {}
        for (const c of columns) row[c.key] = randomValue()
        rows.push(row)
      }
      const delim = rand() < 0.7 ? ',' : ';'
      assertEqual(rows, columns, { delimiter: delim }, `seed=${seed} delim=${delim}`)
    })
  }
})

test.describe('csv-jit fast-path specialization (schema types)', () => {
  // data-fair enforces the schema upstream, so by the time results reach
  // the serializer values match their declared type. These tests cover the
  // inlined fast paths for that guaranteed-in-spec case.

  const typedColumns = [
    { key: 's', header: 'S', type: 'string' as const },
    { key: 'i', header: 'I', type: 'integer' as const },
    { key: 'n', header: 'N', type: 'number' as const },
    { key: 'b', header: 'B', type: 'boolean' as const }
  ]
  const refColumns = typedColumns.map(({ key, header }) => ({ key, header }))

  const assertEqualTyped = (rows: any[], label = '') => {
    const ref = referenceCsv(rows, refColumns)
    const jit = jitCsv(rows, typedColumns as any)
    if (ref !== jit) {
      assert.fail(`${label}\n--- ref ---\n${ref}\n--- jit ---\n${jit}`)
    }
  }

  test('values match schema types', () => {
    assertEqualTyped([
      { s: 'hello', i: 42, n: 3.14, b: true },
      { s: 'world', i: 0, n: -0.5, b: false },
      { s: '', i: -1, n: 0, b: true }
    ])
  })

  test('null and undefined short-circuit to empty cells', () => {
    assertEqualTyped([
      { s: null, i: null, n: null, b: null },
      { s: undefined, i: undefined, n: undefined, b: undefined },
      {}
    ])
  })

  test('strings with quotes/commas/newlines/null chars are escaped correctly', () => {
    assertEqualTyped([
      { s: 'has,comma', i: 1, n: 1, b: true },
      { s: 'has "quote"', i: 1, n: 1, b: true },
      { s: 'has\nnewline', i: 1, n: 1, b: true },
      { s: 'has\0null', i: 1, n: 1, b: true }
    ])
  })

  test('object-typed column (e.g. geometry) falls through to generic formatter', () => {
    // type='object' has no fast path — defers to fmt(). Still byte-equivalent.
    const cols = [{ key: 'g', header: 'G' }] // untyped → fmt path
    const rows = [
      { g: { type: 'Point', coordinates: [1, 2] } },
      { g: null }
    ]
    const ref = referenceCsv(rows, cols)
    const jit = jitCsv(rows, cols)
    assert.equal(jit, ref)
  })
})

test.describe('csv-jit getCsvSerializer (memoized factory)', () => {
  const dataset = {
    id: 'd1',
    finalizedAt: '2026-05-01T00:00:00.000Z',
    schema: [
      { key: 'k1', type: 'string', 'x-originalName': 'Column One' },
      { key: 'k2', type: 'integer', 'x-originalName': 'Column Two', title: 'Two' },
      { key: 'k3', type: 'boolean', 'x-originalName': 'Column Three' }
    ]
  }

  test('uses x-originalName by default, title when useTitle=true', () => {
    const a = getCsvSerializer({ dataset, selectKeys: ['k1', 'k2', 'k3'] })
    assert.match(a.prologue, /"Column One","Column Two","Column Three"/)

    const b = getCsvSerializer({ dataset, selectKeys: ['k1', 'k2', 'k3'], useTitle: true })
    // k1 has no title → falls back to x-originalName
    assert.match(b.prologue, /"Column One","Two","Column Three"/)
  })

  test('selectKeys controls column ordering and subset', () => {
    const s = getCsvSerializer({ dataset, selectKeys: ['k3', 'k1'] })
    assert.match(s.prologue, /"Column Three","Column One"/)
    assert.equal(s.row({ k1: 'hi', k2: 42, k3: true }), '1,"hi"\n')
  })

  test('memoization returns the same compiled function for the same key', () => {
    const a = getCsvSerializer({ dataset, selectKeys: ['k1', 'k2'] })
    const b = getCsvSerializer({ dataset, selectKeys: ['k1', 'k2'] })
    assert.equal(a.row, b.row)
    // changing select invalidates
    const c = getCsvSerializer({ dataset, selectKeys: ['k1'] })
    assert.notEqual(a.row, c.row)
    // changing finalizedAt invalidates (i.e. after re-index)
    const d = getCsvSerializer({ dataset: { ...dataset, finalizedAt: '2026-06-01T00:00:00.000Z' }, selectKeys: ['k1', 'k2'] })
    assert.notEqual(a.row, d.row)
  })
})
