import { strict as assert } from 'node:assert'
const locks = require('../server/misc/utils/locks')

describe('locks', () => {
  it('Acquire and release locks', async () => {
    const db = global.db

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

  it('Acquiring a single lock from many attemtps', async () => {
    const db = global.db

    const promises = []
    for (let i = 0; i < 20; i++) {
      promises.push(locks.acquire(db, 'test'))
    }
    const acks = await Promise.all(promises)
    assert.equal(acks.length, 20)
    assert.equal(acks.filter(ack => !!ack).length, 1)
  })

  // skipped because of long wait
  // 60s is mongodb's background removal task interval
  it.skip('Prolongate and expire locks', async function () {
    this.timeout(240000)
    const db = global.db
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
})
