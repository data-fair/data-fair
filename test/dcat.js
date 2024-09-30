const assert = require('assert').strict
const normalize = require('../server/misc/utils/dcat/normalize')
const validate = require('../server/misc/utils/dcat/validate')
const cioExample = require('./resources/dcat/example-cio.json')
const semiceuExample = require('./resources/dcat/example-semiceu.json')

describe('DCAT support', () => {
  it('Should preserve serialization of a valid example', async function () {
    const normalizedDcat = await normalize(cioExample)
    normalizedDcat['@context'] = cioExample['@context']
    assert.deepEqual(cioExample, normalizedDcat)
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
