import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import moment from 'moment'
import 'moment-timezone'

const localeTimeZone = moment.tz.guess()

describe('icalendar dataset', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Upload dataset in iCalendar format', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('calendar/calendar.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, localeTimeZone)
    assert.ok(dataset.schema.find((f: any) => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find((f: any) => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
    assert.equal(moment(res.data.results[0].DTEND).format('YYYY-MM-DD-HH:mm'), '2008-02-14-00:00')
  })

  it('Upload dataset in iCalendar format with X-WR-TIMEZONE param', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('calendar/calendar-xwr-timezone.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, 'America/New_York')
    assert.ok(dataset.schema.find((f: any) => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find((f: any) => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).tz('America/New_York').format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
  })
})
