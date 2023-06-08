const testUtils = require('./resources/test-utils')
const assert = require('assert').strict

describe('anti virus integration', () => {
  // this test is skipped because it relies on a shared volume that cannot be mounted during docker build
  it.skip('Reject upload of infected file in dataset', async () => {
    const ax = global.ax.dmeadus
    await assert.rejects(testUtils.sendDataset('antivirus/eicar.com.csv', ax), (err) => {
      assert.equal(err.data, 'malicious file detected')
      assert.equal(err.status, 400)
      return true
    })
  })
})
