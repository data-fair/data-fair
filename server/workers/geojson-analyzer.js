const projections = require('../../contract/projections')
const { Writable } = require('stream')

// Analyze geojson dataset data, check validity and detect schema
exports.eventsPrefix = 'analyze'

// This writable stream will receive geojson features, take samples and and deduce a dataset skeleton
class AnalyzerWritable extends Writable {
  constructor (options) {
    super({ objectMode: true })
    this.options = options
    this.samples = {}
    this.schema = [{
      type: 'string',
      key: 'geometry',
      'x-originalName': 'geometry',
      'x-refersTo': 'https://purl.org/geojson/vocab#geometry'
    }]
  }

  _write (feature, encoding, callback) {
    const properties = feature.properties || {}
    if (feature.id) properties.id = feature.id
    for (const property in properties) {
      this.samples[property] = this.samples[property] || new Set([])
      // Use 100 first values, then 1 in ten until 200
      const size = this.samples[property].size
      if (size < 100 || (size < 200 && size % 10 === 0)) {
        this.samples[property].add('' + properties[property])
      }
    }
    callback()
  }

  _final (callback) {
    const fieldsSniffer = require('../datasets/utils/fields-sniffer')
    for (const property in this.samples) {
      const key = fieldsSniffer.escapeKey(property, this.options.dataset)
      const existingField = this.options.existingSchema.find(f => f.key === key)
      const field = {
        key,
        'x-originalName': property,
        ...fieldsSniffer.sniff([...this.samples[property]], this.options.attachments, existingField)
      }
      if (field.type !== 'empty') this.schema.push(field)
    }
    callback()
  }
}

exports.process = async function (app, dataset) {
  const fs = require('fs')
  const JSONStream = require('JSONStream')
  const createError = require('http-errors')
  const iconv = require('iconv-lite')
  const pump = require('../misc/utils/pipe')
  const datasetUtils = require('../datasets/utils')
  const datasetService = require('../datasets/service')

  const attachments = await datasetUtils.lsAttachments(dataset)
  const analyzer = new AnalyzerWritable({ attachments, existingSchema: dataset.schema || [], dataset })
  const readableStream = fs.createReadStream(datasetUtils.filePath(dataset))
  const decodeStream = iconv.decodeStream(dataset.file.encoding)

  // the stream is mainly read to get the features, but we also support extracting the crs property if it is present
  const parseCRSStream = JSONStream.parse('crs')
  decodeStream.pipe(parseCRSStream)
  let crs
  parseCRSStream.on('data', (data) => {
    crs = data
  })

  await pump(
    readableStream,
    decodeStream,
    JSONStream.parse('features.*'),
    analyzer
  )

  dataset.status = 'analyzed'
  dataset.file.schema = analyzer.schema

  if (crs && crs.properties && crs.properties.name) {
    const code = crs.properties.name.replace('urn:ogc:def:crs:', '').replace('::', ':')
    const projection = projections.find(p => p.code === code || p.aliases.includes(code))
    if (!projection) throw createError(400, `[noretry] La projection ${code} dans la propriété "crs" du geojson n'est pas supportée.`)
    dataset.projection = { code: projection.code, title: projection.title }
    dataset.file.schema[0]['x-refersTo'] = 'http://data.ign.fr/def/geometrie#Geometry'
  }

  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  if (await datasetService.validateCompatibleDraft(app, dataset)) return

  const patch = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }
  if (dataset.projection) patch.projection = dataset.projection

  await datasetService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
}
