// this is run in a thread as it is quite cpu and memory intensive

const XLSX = require('xlsx')

// cf https://stackoverflow.com/a/57673262
const val2string = (val) => {
  val = val ?? ''
  return typeof val.toLocaleString === 'function' ? val.toLocaleString() : val + ''
}

function fitToColumn (arrayOfArray) {
  // get maximum character of each column
  return arrayOfArray[0].map((a, i) => ({ wch: Math.min(100, Math.max(...arrayOfArray.map(a2 => val2string(a2[i]).length))) }))
}

module.exports = ({ results, bookType, query, dataset, downloadUrl, labels }) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  const dateProperties = properties
    .filter(p => p.format === 'date' || p.format === 'date-time')
    .map(prop => prop.key)

  const workbook = XLSX.utils.book_new()
  workbook.Props = {}
  workbook.Props.Title = dataset.title

  // data sheet
  const dataArray = [properties.map(prop => prop['x-originalName'] || prop.key)]
  for (const result of results) {
    dataArray.push(properties.map(prop => {
      let value = result[prop.key]
      if (value && dateProperties.includes(prop.key)) value = new Date(value)
      return value
    }))
  }
  const dataSheet = XLSX.utils.aoa_to_sheet(dataArray, { cellDates: true })
  dataSheet['!cols'] = fitToColumn(dataArray)
  XLSX.utils.book_append_sheet(workbook, dataSheet, labels.data)

  // metadata sheet
  const metadataArray = [
    [labels.id, dataset.id],
    [labels.title, dataset.title],
    [labels.owner, dataset.owner.name],
    [labels.dataUpdatedAt, dataset.dataUpdatedAt],
    [labels.count, dataset.count + '']
  ]
  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataArray, { cellDates: true })
  metadataSheet['!cols'] = fitToColumn(metadataArray)
  XLSX.utils.book_append_sheet(workbook, metadataSheet, labels.dataset)

  // query sheet
  const url = new URL(downloadUrl)
  url.searchParams.delete('finalizedAt')
  const queryArray = [
    [labels.url, url.href],
    [labels.select, query.select || '*'],
    [labels.sort, query.sort],
    [labels.q, query.q],
    [labels.qs, query.qs]
  ]
  const querySheet = XLSX.utils.aoa_to_sheet(queryArray, { cellDates: true })
  querySheet['!cols'] = fitToColumn(queryArray)
  XLSX.utils.book_append_sheet(workbook, querySheet, labels.query)

  const result = XLSX.write(workbook, { type: 'buffer', cellDates: true, bookType, compression: true })
  return result
}
