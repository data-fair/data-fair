import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('anti virus integration', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  // this test is skipped because it relies on a shared volume that cannot be mounted during docker build
  it('Reject upload of infected file in dataset', async function () {
    const ax = dmeadus
    await assert.rejects(sendDataset('antivirus/eicar.com.csv', ax), (err: any) => {
      assert.ok(err.data.includes('malicious file detected'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(sendDataset('antivirus/eicar.com.zip', ax), (err: any) => {
      assert.ok(err.data.includes('malicious file detected'))
      assert.equal(err.status, 400)
      return true
    })
  })
})
