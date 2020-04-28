const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

const moment = require('moment')
require('moment-timezone')
const localeTimeZone = moment.tz.guess()

describe('icalendar dataset', () => {
  it('Upload dataset in iCalendar format', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('calendar/calendar.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, localeTimeZone)
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
  })

  it('Upload dataset in iCalendar format with X-WR-TIMEZONE param', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('calendar/calendar-xwr-timezone.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, 'America/New_York')
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).tz('America/New_York').format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
  })

  it('Upload dataset in iCalendar format with VTIMEZONE param', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('calendar/calendar-vtimezone.ics', ax)
    assert.equal(dataset.count, 1)
    assert.ok(dataset.bbox)
    assert.ok(dataset.timePeriod)
    assert.ok(dataset.timePeriod.startDate)
    assert.ok(dataset.timePeriod.endDate)
    assert.equal(dataset.timeZone, 'America/Los_Angeles')
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
    assert.ok(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(moment(res.data.results[0].DTSTART).tz('America/Los_Angeles').format('YYYY-MM-DD-HH:mm'), '2008-02-12-00:00')
  })

  it('Upload dataset with recurring event', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('calendar/calendar-rrule.ics', ax)
    assert.equal(dataset.count, 92)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=DTSTART`)
    assert.ok(res.data.results[0].DTSTART.startsWith('2008-'))
    assert.ok(res.data.results[1].DTSTART.startsWith('2009-'))
    assert.ok(res.data.results[2].DTSTART.startsWith('2010-'))
  })
})
