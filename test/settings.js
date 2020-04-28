const assert = require('assert').strict

describe('settings', () => {
  it('Wrong type', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.get('/api/v1/settings/unknown/dmeadus0')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('No permissions', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.get('/api/v1/settings/user/hlalonde3')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('Read my empty settings', async () => {
    const ax = global.ax.dmeadus
    const res = await ax.get('/api/v1/settings/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  it('Update with wrong format', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.put('/api/v1/settings/user/dmeadus0', { forbiddenKey: 'not allowed' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })
})
