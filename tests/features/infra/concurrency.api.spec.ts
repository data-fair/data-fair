import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')

// run this test manually with "DEBUG=workers WORKER_CONCURRENCY=4 DEFAULT_LIMITS_DATASET_STORAGE=10000000 npm test"

test.describe.skip('concurrency', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('Upload datasets in parallel', async () => {
    const ax = dmeadus

    // define a higher limit
    await ax.post('/api/v1/limits/user/dmeadus0', {
      store_bytes: { limit: 100000000, consumption: 0 },
      lastUpdate: new Date().toISOString()
    }, { params: { key: config.secretKeys.limits } })

    const uploadDataset = async (i: number) => {
      let csv = `${i}_field1,${i}_field2,${i}_field3,${i}_field4,${i}_field5\n`
      for (let j = 0; j < 50000; j++) {
        csv += `"field1${i}${j % 4}","field2${i}${j % 4}","field3${i}${j % 4}","field4${i}${j % 4}","field5${i}${j % 4}"\n`
      }
      const form = new FormData()
      form.append('file', csv, 'dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
      assert.equal(res.status, 201)
      return waitForFinalize(ax, res.data.id)
    }

    const promises: Promise<any>[] = []
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      promises.push(uploadDataset(i))
    }
    const datasets = await Promise.all(promises)
    console.log(datasets.map((d: any) => ({ id: d.id, status: d.status, count: d.count })))
  })
})
