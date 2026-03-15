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
})
