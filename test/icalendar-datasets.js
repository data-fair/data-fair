const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Upload dataset in iCalendar format', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('calendar.ics', ax)
  t.is(dataset.count, 1)
  t.truthy(dataset.bbox)
  t.truthy(dataset.timePeriod)
  t.truthy(dataset.timePeriod.startDate)
  t.truthy(dataset.timePeriod.endDate)
  t.truthy(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate'))
  t.truthy(dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate'))
})
