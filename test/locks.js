const testUtils = require('./resources/test-utils')

const { test } = testUtils.prepare(__filename)

const locks = require('../server/utils/locks')

test('Acquire and release locks', async t => {
  const db = test.app.get('db')

  let ack = await locks.acquire(db, 'test1')
  t.is(ack, true, 'acquire a first lock')

  ack = await locks.acquire(db, 'test1')
  t.is(ack, false, 'acquiring same lock a second time fails')

  ack = await locks.acquire(db, 'test2')
  t.is(ack, true, 'acquire a second lock')

  await locks.release(db, 'test1')
  ack = await locks.acquire(db, 'test1')
  t.is(ack, true, 'acquire released lock')
})

// skipped because of long wait
// 60s is mongodb's background removal task interval
test.skip('Prolongate and expire locks', async t => {
  const db = test.app.get('db')
  // 60s is mongodb's background removal task interval
  let ack = await locks.acquire(db, 'test3')
  t.is(ack, true, 'acquiring lock')
  ack = await locks.acquire(db, 'test3')
  t.is(ack, false, 'acquiring same lock a second time fails')

  await new Promise(resolve => setTimeout(resolve, 60000))
  ack = await locks.acquire(db, 'test3')
  t.is(ack, false, 'acquiring prolongated lock fails')

  locks.stop()
  await new Promise(resolve => setTimeout(resolve, 60000))
  ack = await locks.acquire(db, 'test3')
  t.is(ack, true, 'acquiring expired lock')
})
