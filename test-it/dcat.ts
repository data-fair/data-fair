import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import normalize from '../api/src/misc/utils/dcat/normalize.js'
import validate from '../api/src/misc/utils/dcat/validate.js'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset, formHeaders, timeout } from './utils/index.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')
const alone = await getAxiosAuth('alone@no.org', 'passwd')

const odsRdfExample = fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/ods-export.rdf'), 'utf-8')
const cioExample = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/example-cio.json'), 'utf8'))
const semiceuExample = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '/resources/dcat/example-semiceu.json'), 'utf8'))

describe('DCAT support', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it.skip('Should preserve serialization of a valid example', async function () {
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
