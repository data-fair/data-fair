import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import dcatNormalize from '../../../api/src/misc/utils/dcat/normalize.js'
import dcatValidate from '../../../api/src/misc/utils/dcat/validate.js'

const odsRdfExample = fs.readFileSync(path.join(import.meta.dirname, '../../../test-it/resources/dcat/ods-export.rdf'), 'utf-8')
const semiceuExample = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../test-it/resources/dcat/example-semiceu.json'), 'utf8'))

test.describe('DCAT validation', () => {
  test('Read a XML+RDF DCAT export', async () => {
    const normalizedDcat = await dcatNormalize(odsRdfExample, 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/exports/dcat')
    const valid = dcatValidate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', (dcatValidate as any).errors)
    assert.ok(valid)
  })

  test('Validate a DCAT example with different serialization', async () => {
    const normalizedDcat = await dcatNormalize(semiceuExample)
    const valid = dcatValidate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', (dcatValidate as any).errors)
    assert.ok(valid)
  })
})
