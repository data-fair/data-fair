const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Create thumbnails for datasets with illustrations', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', {
    isRest: true,
    title: 'thumbnails1',
    schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
  })
  res = await ax.post('/api/v1/datasets/thumbnails1/lines', { imageUrl: 'http://test.com/image.png', desc: 'image 1' })
  await workers.hook(`indexer/thumbnails1`)
  res = await ax.get(`/api/v1/datasets/thumbnails1/lines`, { params: { thumbnail: true, select: 'desc' } })
  t.is(res.data.results.length, 1)
  t.is(res.data.results[0].desc, 'image 1')
  t.true(res.data.results[0]._thumbnail.includes('test.com/image.png'))
})
