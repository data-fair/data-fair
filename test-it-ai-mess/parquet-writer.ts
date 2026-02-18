import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import { ParquetWriter } from '../parquet-writer/index.js'

describe('parquet-writer', function () {
  it('writes parquet file into buffers from a dataset', function () {
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
