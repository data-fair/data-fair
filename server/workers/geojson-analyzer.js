const projections = require('../../contract/projections')

// Analyze geojson dataset data, check validity and detect schema
exports.eventsPrefix = 'analyze'

exports.process = async function (app, dataset) {
  const createError = require('http-errors')
  const JSONStream = require('JSONStream')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const fieldsSniffer = require('../datasets/utils/fields-sniffer')

  const attachments = await datasetUtils.lsAttachments(dataset)

  // the stream is mainly read to get the features, but we also support extracting the crs property if it is present
  const parseCRSStream = JSONStream.parse('crs')
  let crs
  parseCRSStream.on('data', (data) => {
    crs = data
  })

  const schema = [{
    type: 'string',
    key: 'geometry',
    'x-originalName': 'geometry',
    'x-refersTo': 'https://purl.org/geojson/vocab#geometry'
  }]
  const sampleValues = await datasetUtils.sampleValues(dataset, ['geometry'], (decodedData) => parseCRSStream.write(decodedData))
  parseCRSStream.end()

  for (const property in sampleValues) {
    const key = fieldsSniffer.escapeKey(property, dataset)
    const existingField = dataset.schema?.find(f => f.key === key)
    const field = {
      key,
      'x-originalName': property,
      ...fieldsSniffer.sniff([...sampleValues[property]], attachments, existingField)
    }
    if (field.type !== 'empty') schema.push(field)
  }

  dataset.status = 'analyzed'
  dataset.file.schema = schema

  if (crs && crs.properties && crs.properties.name) {
    const code = crs.properties.name.replace('urn:ogc:def:crs:', '').replace('::', ':')
    const projection = projections.find(p => p.code === code || p.aliases.includes(code))
    if (!projection) throw createError(400, `[noretry] La projection ${code} dans la propriété "crs" du geojson n'est pas supportée.`)
    dataset.projection = { code: projection.code, title: projection.title }
    dataset.file.schema[0]['x-refersTo'] = 'http://data.ign.fr/def/geometrie#Geometry'
  }

  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  const patch = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }
  if (dataset.projection) patch.projection = dataset.projection

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
