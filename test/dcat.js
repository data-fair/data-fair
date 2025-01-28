import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import normalize from '../api/src/misc/utils/dcat/normalize.js'
import validate from '../api/src/misc/utils/dcat/validate.js'
import cioExample from './resources/dcat/example-cio.json' with { type: 'json' }
import semiceuExample from './resources/dcat/example-semiceu.json' with { type: 'json' }
const odsRdfExample = fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/ods-export.rdf'), 'utf-8')

describe('DCAT support', () => {
  it('Should preserve serialization of a valid example', async function () {
    const normalizedDcat = await normalize(cioExample)
    normalizedDcat['@context'] = cioExample['@context']
    assert.deepEqual(cioExample, normalizedDcat)
    const valid = validate(normalizedDcat)
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })

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
