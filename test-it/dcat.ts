import { strict as assert } from 'node:assert'
import { it, describe } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import normalize from '../api/src/misc/utils/dcat/normalize.js'
import validate from '../api/src/misc/utils/dcat/validate.js'

const odsRdfExample = fs.readFileSync(path.resolve('./test/resources/dcat/ods-export.rdf'), 'utf-8')
const semiceuExample = JSON.parse(fs.readFileSync(path.resolve('./test/resources/dcat/example-semiceu.json'), 'utf8'))

describe('DCAT support', function () {
  it('Read a XML+RDF DCAT export', async function () {
    const normalizedDcat = await normalize(odsRdfExample, 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/exports/dcat')
    const valid = validate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })

  it('Validate a DCAT example with different serialization', async function () {
    const normalizedDcat = await normalize(semiceuExample)
    const valid = validate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })
})
