// import { strict as assert } from 'node:assert'
// import parquet from '@dsnp/parquetjs'
import { ParquetWriter } from '../parquet-writer/index.js'

describe.only('parquet-writer', function () {
  it('writes parquet file for a dataset', function () {
    console.log('OK')
    const schema = [
      { key: 'str1', type: 'string', 'x-required': true },
      { key: 'bool1', type: 'boolean', 'x-required': false }
    ]
    const buffer = Buffer.alloc(0)
    const parquetWriter = new ParquetWriter(schema, buffer)
    parquetWriter.addRows([{ str1: 'test1' }, { str1: 'test2', bool1: false }])
    parquetWriter.finish()
  })
})

/* describe('parquet-exporter', function () {
  it('apply permissions to datasets', async function () {

  })
}) */
/*
const schema = parquet.ParquetSchema.fromJsonSchema({
  type: 'object',
  properties: {
    name: {
      type: 'string',
    },
    quantity: {
      type: 'integer',
    },
    price: {
      type: 'number',
    },
    date: {
      type: 'string',
      format: 'date-time',
    },
    in_stock: {
      type: 'boolean',
    },
  },
  required: ['name', 'quantity', 'price', 'date', 'in_stock'],
})
*/
