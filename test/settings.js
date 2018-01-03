const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Wrong type', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  try {
    await ax.get('/api/v1/settings/unknown/dmeadus0')
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }
})

test('No permissions', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  try {
    await ax.get('/api/v1/settings/user/hlalonde3')
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
})

test('Read my empty settings', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.get('/api/v1/settings/user/dmeadus0')
  t.is(res.status, 200)
  t.deepEqual(res.data, {})
})

test('Update with wrong format', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  try {
    await ax.put('/api/v1/settings/user/dmeadus0', {forbiddenKey: 'not allowed'})
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }
})
