import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ParquetWriter } from '../../../parquet-writer/index.js'

test.describe('parquet-writer', () => {
  test('writes parquet file into buffers from a dataset', () => {
    const schema = [
      { key: 'str1', type: 'string', 'x-required': true },
      { key: 'bool1', type: 'boolean', 'x-required': false }
    ]
    const parquetWriter = new ParquetWriter(schema)
    const buf1 = parquetWriter.addRows([{ str1: 'test1' }, { str1: 'test2', bool1: false }])
    assert.ok(buf1 instanceof Buffer)
    const buf2 = parquetWriter.finish()
    assert.ok(buf2 instanceof Buffer)
  })

  test('throws a JS error rather than aborting the process when Rust panics', () => {
    const schema = [
      { key: 'str1', type: 'string', 'x-required': true },
      { key: 'x', type: 'unsupported-type', 'x-required': true }
    ]
    const parquetWriter = new ParquetWriter(schema)
    assert.throws(
      () => parquetWriter.addRows([{ str1: 'a', x: 'b' }]),
      /unsupported type/
    )
  })

  test('writes a batch where an optional column is null in every row', () => {
    const schema = [
      { key: 'str1', type: 'string', 'x-required': true },
      { key: 'bool1', type: 'boolean', 'x-required': false },
      { key: 'int1', type: 'integer', 'x-required': false },
      { key: 'num1', type: 'number', 'x-required': false },
      { key: 'date1', type: 'string', format: 'date', 'x-required': false },
      { key: 'dt1', type: 'string', format: 'date-time', 'x-required': false },
      { key: 'str2', type: 'string', 'x-required': false }
    ]
    const parquetWriter = new ParquetWriter(schema)
    const rows = Array.from({ length: 100 }, (_, i) => ({ str1: `row-${i}` }))
    const buf1 = parquetWriter.addRows(rows)
    assert.ok(buf1 instanceof Buffer)
    const buf2 = parquetWriter.finish()
    assert.ok(buf2 instanceof Buffer)
  })
})
