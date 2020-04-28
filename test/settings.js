const testUtils = require('./resources/test-utils')



it('Wrong type', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  try {
    await ax.get('/api/v1/settings/unknown/dmeadus0')
    assert.fail()
  } catch (err) {
    assert.equal(err.status, 400)
  }
})

it('No permissions', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  try {
    await ax.get('/api/v1/settings/user/hlalonde3')
    assert.fail()
  } catch (err) {
    assert.equal(err.status, 403)
  }
})

it('Read my empty settings', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const res = await ax.get('/api/v1/settings/user/dmeadus0')
  assert.equal(res.status, 200)
  t.deepEqual(res.data, {})
})

it('Update with wrong format', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  try {
    await ax.put('/api/v1/settings/user/dmeadus0', { forbiddenKey: 'not allowed' })
    assert.fail()
  } catch (err) {
    assert.equal(err.status, 400)
  }
})
