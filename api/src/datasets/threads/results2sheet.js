// this is run in a thread as it is quite cpu and memory intensive

// It is strongly recommended to use CommonJS in NodeJS.
// https://docs.sheetjs.com/docs/getting-started/installation/nodejs#usage
import Module from 'node:module'
const require = Module.createRequire(import.meta.url)
const XLSX = require('@e965/xlsx')

// cf https://stackoverflow.com/a/57673262
const val2string = (val) => {
  val = val ?? ''
  return typeof val.toLocaleString === 'function' ? val.toLocaleString() : val + ''
}

function fitToColumn (arrayOfArray) {
  // get maximum character of each column
  return arrayOfArray[0].map((a, i) => ({ wch: Math.min(100, Math.max(...arrayOfArray.map(a2 => val2string(a2[i]).length))) }))
}

export default ({ results, bookType, query, dataset, downloadUrl, labels, datasetsMetadata }) => {
  const select = (query.select && query.select !== '*') ? query.select.split(',') : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  const properties = select.map(key => dataset.schema.find(prop => prop.key === key))
  const allProperties = dataset.schema.filter(f => !f['x-calculated'])
  const dateProperties = properties
    .filter(p => p.format === 'date' || p.format === 'date-time')
    .map(prop => prop.key)

  const workbook = XLSX.utils.book_new()
  workbook.Props = {}
  workbook.Props.Title = dataset.title

  // --- Sheet 1: data ---
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

  // --- Sheet 2: metadata ---
  const ownerName = dataset.owner.department
    ? dataset.owner.name + ' - ' + (dataset.owner.departmentName || dataset.owner.department)
    : dataset.owner.name

  const metadataArray = [
    [labels.metaKey, labels.metaLabel, labels.metaValue],
    ['id', labels.id, dataset.id],
    ['slug', labels.slug, dataset.slug || ''],
    ['title', labels.title, dataset.title || ''],
    ['summary', labels.summary, dataset.summary || ''],
    ['description', labels.description, dataset.description || ''],
    ['owner', labels.owner, ownerName],
    ['count', labels.count, dataset.count != null ? dataset.count + '' : ''],
    ['createdAt', labels.createdAt, dataset.createdAt || ''],
    ['updatedAt', labels.updatedAt, dataset.updatedAt || ''],
    ['dataUpdatedAt', labels.dataUpdatedAt, dataset.dataUpdatedAt || '']
  ]

  // DCAT metadata fields: show if active in settings or if value is present
  const dcatFields = [
    { key: 'modified', value: dataset.modified },
    { key: 'spatial', value: dataset.spatial },
    {
      key: 'temporal',
      value: dataset.temporal
        ? [dataset.temporal.start, dataset.temporal.end].filter(Boolean).join(' - ')
        : undefined
    },
    { key: 'frequency', value: dataset.frequency },
    { key: 'creator', value: dataset.creator },
    { key: 'keywords', value: dataset.keywords && dataset.keywords.length ? dataset.keywords.join(', ') : undefined }
  ]
  for (const field of dcatFields) {
    const settingsField = datasetsMetadata[field.key]
    if (field.value || (settingsField && settingsField.active)) {
      const label = (settingsField && settingsField.title) || labels[field.key] || field.key
      metadataArray.push([field.key, label, field.value || ''])
    }
  }

  // Custom metadata from organization settings
  if (datasetsMetadata.custom && datasetsMetadata.custom.length && dataset.customMetadata) {
    for (const custom of datasetsMetadata.custom) {
      if (!custom.key) continue
      const value = dataset.customMetadata[custom.key]
      metadataArray.push([custom.key, custom.title || custom.key, value || ''])
    }
  }

  const metadataSheet = XLSX.utils.aoa_to_sheet(metadataArray, { cellDates: true })
  metadataSheet['!cols'] = fitToColumn(metadataArray)
  XLSX.utils.book_append_sheet(workbook, metadataSheet, labels.metadata)

  // --- Sheet 3: schema ---
  const schemaArray = [
    [labels.schemaKey, labels.schemaType, labels.schemaFormat, labels.schemaTitle, labels.schemaDescription, labels.schemaOriginalName]
  ]
  for (const prop of allProperties) {
    schemaArray.push([
      prop.key,
      prop.type || '',
      prop.format || '',
      prop.title || '',
      prop.description || '',
      prop['x-originalName'] || ''
    ])
  }
  const schemaSheet = XLSX.utils.aoa_to_sheet(schemaArray, { cellDates: true })
  schemaSheet['!cols'] = fitToColumn(schemaArray)
  XLSX.utils.book_append_sheet(workbook, schemaSheet, labels.schema)

  // --- Sheet 4: labels ---
  const labelsArray = [
    [labels.labelsColumn, labels.labelsValue, labels.labelsLabel]
  ]
  for (const prop of allProperties) {
    if (prop['x-labels'] && typeof prop['x-labels'] === 'object') {
      for (const [enumValue, enumLabel] of Object.entries(prop['x-labels'])) {
        labelsArray.push([prop.key, enumValue, enumLabel])
      }
    }
  }
  const labelsSheet = XLSX.utils.aoa_to_sheet(labelsArray, { cellDates: true })
  labelsSheet['!cols'] = fitToColumn(labelsArray)
  XLSX.utils.book_append_sheet(workbook, labelsSheet, labels.labels)

  // --- Sheet 5: query ---
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
