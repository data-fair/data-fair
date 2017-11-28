const [test, ax] = require('./resources/test-utils').prepare('status', 5605)

test('Get status', async t => {
  const res = await ax.get('/api/v1/status')
  t.is(res.status, 200)
})
