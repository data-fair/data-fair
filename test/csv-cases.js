// Some edge cases with CSV files
const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Process newly uploaded CSV dataset', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('2018-08-30_Type_qualificatif.csv', ax)
  t.is(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 3)
})
