const assert = require('assert').strict
const locks = require('../server/utils/locks')

it('Acquire and release locks', async () => {
  const db = test.app.get('db')

  let ack = await locks.acquire(db, 'test1')
  assert.equal(ack, true, 'acquire a first lock')

  ack = await locks.acquire(db, 'test1')
  assert.equal(ack, false, 'acquiring same lock a second time fails')

  ack = await locks.acquire(db, 'test2')
  assert.equal(ack, true, 'acquire a second lock')

  await locks.release(db, 'test1')
  ack = await locks.acquire(db, 'test1')
  assert.equal(ack, true, 'acquire released lock')
})

// skipped because of long wait
// 60s is mongodb's background removal task interval
it.skip('Prolongate and expire locks', async () => {
  const db = test.app.get('db')
  // 60s is mongodb's background removal task interval
  let ack = await locks.acquire(db, 'test3')
  assert.equal(ack, true, 'acquiring lock')
  ack = await locks.acquire(db, 'test3')
  assert.equal(ack, false, 'acquiring same lock a second time fails')

  await new Promise(resolve => setTimeout(resolve, 60000))
  ack = await locks.acquire(db, 'test3')
  assert.equal(ack, false, 'acquiring prolongated lock fails')

  locks.stop()
  await new Promise(resolve => setTimeout(resolve, 60000))
  ack = await locks.acquire(db, 'test3')
  assert.equal(ack, true, 'acquiring expired lock')
})
