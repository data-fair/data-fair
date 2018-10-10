const testUtils = require('./resources/test-utils')
const nock = require('nock')

const { test, config, axiosBuilder } = testUtils.prepare(__filename)

const html = '<html><head><meta name="application-name" content="test"></head><body></body></html>'
nock('http://monapp1.com').persist().get('/').reply(200, html)
nock('http://monapp2.com').persist().get('/').reply(200, html)

test.serial('Get public base applications', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/base-applications', { params: { public: true } })
  t.is(res.status, 200)
  t.is(res.data.count, 1)
})

test.serial(`Can't get non public base applications`, async t => {
  const ax = await axiosBuilder()
  try {
    await ax.get('/api/v1/base-applications')
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
})

test.serial('Get base applications as admin', async t => {
  const ax = await axiosBuilder('alban.mouton@koumoul.com')
  const res = await ax.get('/api/v1/base-applications')
  t.is(res.status, 200)
  t.is(res.data.count, 2)
})
