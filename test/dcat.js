const assert = require('assert').strict
const normalize = require('../server/misc/utils/dcat/normalize')
const validate = require('../server/misc/utils/dcat/validate')
const cioExample = require('./resources/dcat/example-cio.json')
const semiceuExample = require('./resources/dcat/example-semiceu.json')

describe('DCAT support', () => {
  it('Should preserve serialization of a valid example', async function () {
    const normalizedDcat = await normalize(cioExample)
    normalizedDcat['@context'] = cioExample['@context']
    // ignore temporal that we fixed from string to object
    for (const dataset of cioExample.dataset) {
      if (dataset.temporal) {
        dataset.temporal = {
          '@type': 'dc:PeriodOfTime',
          endDate: '2021-12-31T00:00:00+00:00',
          startDate: '2021-01-01T00:00:00+00:00'
        }
      }
    }
    assert.deepEqual(cioExample, normalizedDcat)
    const valid = validate(normalizedDcat)
    console.log(normalizedDcat.dataset[0])
    if (!valid) console.error('DCAT validation failed', validate.errors)
  })

  it('Validate a DCAT example with different serialization', async function () {
    const normalizedDcat = await normalize(semiceuExample)
    const valid = validate(normalizedDcat)
    console.log(normalizedDcat.dataset[1])
    if (!valid) console.error('DCAT validation failed', validate.errors)
    assert.ok(valid)
  })
})
