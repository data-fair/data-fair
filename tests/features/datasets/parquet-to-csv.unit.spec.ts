import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parquetToCsv } from '../../../parquet-writer/index.js'

const tmpCsv = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parquet-to-csv-')), 'out.csv')

test.describe('parquet to csv conversion', () => {
  test('converts a typed parquet file and returns its declared types', async () => {
    const csvFile = tmpCsv()
    const result = await parquetToCsv('./tests/resources/datasets/types.parquet', csvFile)
    assert.equal(result.numRows, 3)
    assert.deepEqual(result.fields, [
      { name: 'code', type: 'string' },
      { name: 'entier', type: 'integer' },
      { name: 'nombre', type: 'number' },
      { name: 'actif', type: 'boolean' },
      { name: 'jour', type: 'string', format: 'date' },
      { name: 'horodatage', type: 'string', format: 'date-time' },
      { name: 'tags', type: 'string', separator: ';' },
      { name: 'objet', type: 'string' },
      { name: 'Libellé', type: 'string' }
    ])
    assert.equal(fs.readFileSync(csvFile, 'utf8'), '\uFEFF' + `code,entier,nombre,actif,jour,horodatage,tags,objet,Libellé
01001,1,1.0,1,2024-01-31,2024-01-31T10:30:00+01:00,a;b,"{""x"":1,""y"":""un""}",premier
02002,2,2.5,0,2024-02-01,,,,deuxième
75056,3,,,,2024-07-01T09:00:00+02:00,,"{""x"":3,""y"":""trois""}",
`)
  })

  test('rejects a file that is not parquet', async () => {
    await assert.rejects(parquetToCsv('./tests/resources/datasets/dataset1.csv', tmpCsv()), /parquet|magic|footer/i)
  })
})
