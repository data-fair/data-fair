const FormData = require('form-data')
const config = require('config')
const assert = require('assert').strict
const workers = require('../server/workers')
const testUtils = require('./resources/test-utils')

// run this test manually with "DEBUG=workers WORKER_CONCURRENCY=8 DEFAULT_LIMITS_DATASET_STORAGE=10000000 npm test"

describe('concurrency', () => {
  it.skip('Upload datasets in parallel', async function () {
    this.timeout(120000)

    const ax = global.ax.dmeadus

    // define a higher limit
    await ax.post('/api/v1/limits/user/dmeadus0', {
      store_bytes: { limit: 100000000, consumption: 0 },
      lastUpdate: new Date().toISOString(),
    }, { params: { key: config.secretKeys.limits } })

    const sendDataset = async (i) => {
      let csv = `${i}_field1,${i}_field2,${i}_field3,${i}_field4,${i}_field5\n`
      for (let j = 0; j < 10000; j++) {
        csv += `"field1${i}${j % 4}","field2${i}${j % 4}","field3${i}${j % 4}","field4${i}${j % 4}","field5${i}${j % 4}"\n`
      }
      const form = new FormData()
      form.append('file', csv, `dataset${i}.csv`)
      const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.equal(res.status, 201)
      return workers.hook(`finalizer/${res.data.id}`)
    }

    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(sendDataset(i))
    }
    const datasets = await Promise.all(promises)
    console.log(datasets.map(d => ({ id: d.id, status: d.status, count: d.count })))
  })
})
