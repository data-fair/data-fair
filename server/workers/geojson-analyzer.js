const { Writable } = require('stream')

// Analyze geojson dataset data, check validity and detect schema
exports.eventsPrefix = 'analyze'

// This writable stream will receive geojson features, take samples and and deduce a dataset schema
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
    const fieldsSniffer = require('../utils/fields-sniffer')
    for (const property in this.samples) {
      const key = fieldsSniffer.escapeKey(property)
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
  const util = require('util')
  const fs = require('fs')
  const JSONStream = require('JSONStream')
  const pump = util.promisify(require('pump'))
  const iconv = require('iconv-lite')
  const datasetUtils = require('../utils/dataset')

  const db = app.get('db')
  const attachments = await datasetUtils.lsAttachments(dataset)
  const analyzer = new AnalyzerWritable({ attachments, existingSchema: dataset.schema || [] })
  await pump(
    fs.createReadStream(datasetUtils.filePath(dataset)),
    iconv.decodeStream(dataset.file.encoding),
    JSONStream.parse('features.*'),
    analyzer
  )

  dataset.status = 'analyzed'
  dataset.file.schema = analyzer.schema

  datasetUtils.mergeFileSchema(dataset)
  datasetUtils.cleanSchema(dataset)

  if (await datasetUtils.validateCompatibleDraft(app, dataset)) return

  const patch = {
    status: 'analyzed',
    file: dataset.file,
    schema: dataset.schema
  }

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
}
