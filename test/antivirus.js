import * as testUtils from './resources/test-utils.js'
import { strict as assert } from 'node:assert'

describe('anti virus integration', function () {
  // this test is skipped because it relies on a shared volume that cannot be mounted during docker build
  it.skip('Reject upload of infected file in dataset', async function () {
    const ax = global.ax.dmeadus
    await assert.rejects(testUtils.sendDataset('antivirus/eicar.com.csv', ax), (err) => {
      assert.equal(err.data, 'malicious file detected')
      assert.equal(err.status, 400)
      return true
    })
  })
})
