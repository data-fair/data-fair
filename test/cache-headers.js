const testUtils = require('./resources/test-utils')
const { test, axiosBuilder, config } = testUtils.prepare(__filename)

test.serial('Manage cache-control header based on permissions', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const axAnonymous = await axiosBuilder('dmeadus0@answers.com:passwd')

  // Set the correct owner
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  t.is(dataset.status, 'finalized')
  t.is(dataset.owner.type, 'user')
  t.is(dataset.owner.id, 'dmeadus0')

  let res = await ax.get('/api/v1/datasets/dataset1/lines')
  t.is(res.headers['cache-control'], 'must-revalidate, private')

  res = await ax.get('/api/v1/datasets/dataset1/lines', { params: { finalizedAt: dataset.finalizedAt } })
  t.is(res.headers['cache-control'], 'must-revalidate, private, max-age=' + config.cache.timestampedPublicMaxAge)

  // make the dataset public
  await ax.put('/api/v1/datasets/dataset1/permissions', [
    { classes: ['read'] }
  ])

  res = await ax.get('/api/v1/datasets/dataset1/lines')
  t.is(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)
  res = await axAnonymous.get('/api/v1/datasets/dataset1/lines')
  t.is(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

  // console.log(res.headers)
})
