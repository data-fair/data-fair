const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Get public base applications', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/base-applications')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
})

test.serial('Get privately readable base app', async t => {
  // Only public at first
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
  t.is(res.status, 200)
  t.is(res.data.count, 1)

  // super admin patchs the private one
  const adminAx = await axiosBuilder('superadmin@test.com:superpasswd:adminMode')
  res = await adminAx.get('/api/v1/admin/base-applications')
  t.is(res.status, 200)
  t.is(res.data.count, 2)
  await adminAx.patch('/api/v1/base-applications/http:monapp2.com', {
    privateAccess: [{ type: 'user', id: 'dmeadus0' }, { type: 'user', id: 'another' }]
  })
  t.is(res.status, 200)

  // User sees the public and private base app
  res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
  t.is(res.status, 200)
  t.is(res.data.count, 2)
  const baseApp = res.data.results.find(a => a.url === 'http://monapp2.com/')
  t.is(baseApp.privateAccess.length, 1)
})
