const assert = require('assert').strict
const testUtils = require('./resources/test-utils')
const config = require('config')

it('Manage cache-control header based on permissions', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const axAnonymous = await global.ax.builder('dmeadus0@answers.com:passwd')

  // Set the correct owner
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  assert.equal(dataset.status, 'finalized')
  assert.equal(dataset.owner.type, 'user')
  assert.equal(dataset.owner.id, 'dmeadus0')

  let res = await ax.get('/api/v1/datasets/dataset1/lines')
  assert.equal(res.headers['cache-control'], 'must-revalidate, private')

  res = await ax.get('/api/v1/datasets/dataset1/lines', { params: { finalizedAt: dataset.finalizedAt } })
  assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=' + config.cache.timestampedPublicMaxAge)

  // make the dataset public
  await ax.put('/api/v1/datasets/dataset1/permissions', [
    { classes: ['read'] }
  ])

  res = await ax.get('/api/v1/datasets/dataset1/lines')
  assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)
  res = await axAnonymous.get('/api/v1/datasets/dataset1/lines')
  assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

  // console.log(res.headers)
})
