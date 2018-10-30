// Some edge cases with CSV files
const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Reject wrong api key', async t => {
  const ax = await axiosBuilder(null, { headers: { 'x-apiKey': 'wrong' } })
  try {
    await ax.get(`/api/v1/stats`)
    t.fail()
  } catch (err) {
    t.is(err.status, 401)
  }
})

test.serial('Create and use a User level api key', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const res = await ax.put(`/api/v1/settings/user/dmeadus0`, { apiKeys: [
    { title: 'key1', scopes: ['stats'] },
    { title: 'key2', scopes: ['datasets'] }
  ] })
  t.is(res.data.name, 'Danna Meadus')
  const key1 = res.data.apiKeys[0].clearKey
  t.truthy(key1)
  const key2 = res.data.apiKeys[1].clearKey
  t.truthy(key2)

  // Right scope
  const axKey1 = await axiosBuilder(null, { headers: { 'x-apiKey': key1 } })
  await axKey1.get(`/api/v1/stats`)

  // Wrong scope
  const axKey2 = await axiosBuilder(null, { headers: { 'x-apiKey': key2 } })
  try {
    await axKey2.get(`/api/v1/stats`)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }

  // Set the correct owner
  const dataset = await testUtils.sendDataset('dataset1.csv', axKey2)
  t.is(dataset.status, 'finalized')
  t.is(dataset.owner.type, 'user')
  t.is(dataset.owner.id, 'dmeadus0')
})

test.serial('Create and use an organization level api key', async t => {
  const ax = await axiosBuilder('cdurning2@desdev.cn')
  const res = await ax.put(`/api/v1/settings/organization/3sSi7xDIK`, { apiKeys: [
    { title: 'key1', scopes: ['datasets'] }
  ] })
  t.is(res.data.name, 'Ntag')
  const key1 = res.data.apiKeys[0].clearKey
  t.truthy(key1)

  // Set the correct owner
  const axKey1 = await axiosBuilder(null, { headers: { 'x-apiKey': key1 } })
  const dataset = await testUtils.sendDataset('dataset1.csv', axKey1)
  t.is(dataset.status, 'finalized')
  t.is(dataset.owner.type, 'organization')
  t.is(dataset.owner.id, '3sSi7xDIK')
})
