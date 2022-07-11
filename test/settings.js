const assert = require('assert').strict

describe('settings API', () => {
  it('should reject wrong account type', async () => {
    try {
      await global.ax.dmeadus.get('/api/v1/settings/unknown/dmeadus0')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('should reject anonymous request', async () => {
    try {
      await global.ax.dmeadus.get('/api/v1/settings/user/hlalonde3')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('should read user empty settings', async () => {
    const res = await global.ax.dmeadus.get('/api/v1/settings/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  it('should reject update with wrong format', async () => {
    try {
      await global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', { forbiddenKey: 'not allowed' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('should read settings as organization admin', async () => {
    const res = await global.ax.dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {})
  })

  it('should write settings as organization admin', async () => {
    await global.ax.dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', { topics: [{ id: 'topic1', title: 'Topic 1' }] })
    const res = await global.ax.dmeadusOrg.get('/api/v1/settings/organization/KWqAGZ4mG')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.topics, [{ id: 'topic1', title: 'Topic 1' }])
  })

  it('should write and read settings as organization department admin', async () => {
    await assert.rejects(global.ax.hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { topics: [{ id: 'topic1', title: 'Topic 1' }] }), (err) => err.status === 400)
    await global.ax.dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', { apiKeys: [{ title: 'Api key 1' }] })
    const res = await global.ax.hlalonde3Org.get('/api/v1/settings/organization/KWqAGZ4mG:dep1')
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Fivechat - dep1')
    assert.equal(res.data.department, 'dep1')
    assert.deepEqual(res.data.apiKeys[0].title, 'Api key 1')
  })
})
