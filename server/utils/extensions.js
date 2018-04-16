const { Readable, Transform, Writable } = require('stream')
const util = require('util')
const config = require('config')
const eventToPromise = require('event-to-promise')
const request = require('request')
const byline = require('byline')
const hash = require('object-hash')
const pump = util.promisify(require('pump'))
const flatten = require('flat')
const turf = require('turf')
const es = require('./es')
const geoUtils = require('./geo')

// Create a function that will transform items from a dataset into inputs for an action
function prepareMapping(action, schema, extensionKey, selectFields) {
  const mapping = action.input.map(input => {
    const field = schema.find(f =>
      f['x-refersTo'] === input.concept &&
      f['x-refersTo'] !== 'http://schema.org/identifier' &&
      f.key.indexOf(extensionKey) !== 0
    )
    if (field) return [field.key, input.name]
  }).filter(i => i)
  const idInput = action.input.find(input => input.concept === 'http://schema.org/identifier').name
  return (item) => {
    const mappedItem = {}
    mapping.forEach(m => {
      const val = item.doc[m[0]]
      if (val !== undefined && val !== '') mappedItem[m[1]] = val
    })
    // remember a hash of the input.. so that we can store it alongside the result and use this to reapply
    // extension to a new version of the index without using the remote service
    const h = hash(mappedItem)
    mappedItem[idInput] = item.id
    return [mappedItem, h]
  }
}

// Maps input from documents to the expected parameters of a remote service action
class PrepareInputStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    this.hashes = options.hashes
    this.stats = options.stats
    this.mapping = prepareMapping(options.action, options.dataset.schema, options.extensionKey, options.selectFields)
  }
  _transform(item, encoding, callback) {
    const [mappedItem, h] = this.mapping(item)
    // No actual parameters on this line (only the key)
    if (Object.keys(mappedItem).length === 1) {
      if (this.stats) this.stats.count += 1
      return callback()
    }
    this.hashes[item.id] = h
    callback(null, JSON.stringify(mappedItem) + '\n')
  }
}

// Transform stream fetching extensions data from previous index
// used when re-indexing
class ExtendStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    this.options = options
  }
  async init() {
    const db = this.options.db
    this.indexName = es.indexName(this.options.dataset)
    const extensions = this.options.dataset.extensions || []
    this.mappings = {}
    this.extensionsMap = {}
    for (let extension of extensions) {
      if (!extension.active) return
      const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
      if (!remoteService) continue
      const action = remoteService.actions.find(action => action.id === extension.action)
      if (!action) continue
      const extensionKey = getExtensionKey(extension.remoteService, extension.action)
      this.mappings[extensionKey] = prepareMapping(action, this.options.dataset.schema, extensionKey)
      this.extensionsMap[extensionKey] = extension
    }
  }
  async _transform(item, encoding, callback) {
    try {
      if (!this.mappings) await this.init()
      const esClient = this.options.es
      for (let extensionKey in this.mappings) {
      /* eslint no-unused-vars: off */
        const [mappedItem, h] = this.mappings[extensionKey]({doc: item})
        const res = await esClient.search({
          index: this.indexName,
          body: {query: {constant_score: {filter: {term: {[extensionKey + '._hash']: h}}}}}
        })
        if (res.hits.total > 0) {
          const extensionResult = res.hits.hits[0]._source[extensionKey]
          const selectFields = this.extensionsMap[extensionKey].select || []
          const selectedExtensionResult = Object.keys(extensionResult)
            .filter(key => key === '_hash' || selectFields.length === 0 || selectFields.includes(key))
            .reduce((a, key) => { a[key] = extensionResult[key]; return a }, {})
          item[extensionKey] = selectedExtensionResult
        }
      }
    } catch (err) {
      return callback(err)
    }
    callback(null, item)
  }
}

exports.extendStream = (options) => new ExtendStream(options)

// Input stream scanning a full ES index using the scroll api
class ESInputStream extends Readable {
  constructor(options) {
    super({objectMode: true})
    this.esClient = options.esClient
    this.indexName = options.indexName
    this.forceNext = options.forceNext
    this.extensionKey = options.extensionKey
    this.stats = options.stats
    this.i = 0

    this.query = {bool: {must_not: {exists: {field: this.extensionKey + '._hash'}}}}
    if (this.forceNext || !this.extensionKey) {
      this.query = {match_all: {}}
    }
  }
  async init() {
    if (!this.stats) return
    const res = await this.esClient.count({
      index: this.indexName,
      body: {query: this.query}
    })
    this.stats.missing = res.count
  }
  async _read() {
    if (this.reading) return
    this.reading = true
    try {
      let res
      if (!this.scrollId) {
        res = await this.esClient.search({
          index: this.indexName,
          scroll: '100s',
          body: {query: this.query}
        })
      } else {
        res = await this.esClient.scroll({scroll_id: this.scrollId, scroll: '100s'})
      }
      this.scrollId = res._scroll_id

      for (let hit of res.hits.hits) {
        this.reading = this.push({id: hit._id, doc: flatten(hit._source)})
        this.i += 1
      }

      if (res.hits.total > this.i) {
        if (this.reading) {
          this.reading = false
          await this._read()
        }
      } else {
        this.push(null)
      }
    } catch (err) {
      console.error('ES read error', err)
      this.emit('error', err)
    }
  }
}

// Maps output from a remote service action to new fields in the documents
class PrepareOutputStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    this.hashes = options.hashes
    this.extensionKey = options.extensionKey
    const action = options.action
    this.selectFields = options.selectFields || []
    this.idOutput = action.output.find(output => output.concept === 'http://schema.org/identifier').name
  }
  _transform(chunk, encoding, callback) {
    let item
    try {
      item = JSON.parse(chunk)
    } catch (err) {
      return callback(new Error('Bad content - ' + chunk))
    }
    const selectedItem = Object.keys(item)
      .filter(itemKey => this.selectFields.length === 0 || this.selectFields.includes(itemKey))
      .reduce((a, itemKey) => { a[itemKey] = item[itemKey]; return a }, {})

    const mappedItem = {doc: {[this.extensionKey]: selectedItem}}
    mappedItem.id = item[this.idOutput]
    selectedItem._hash = this.hashes[mappedItem.id]
    delete this.hashes[mappedItem.id]
    callback(null, mappedItem)
  }
}

// Output stream performing partial doc updates in ES
class ESOutputStream extends Writable {
  constructor(options) {
    super({objectMode: true})
    this.esClient = options.esClient
    this.indexName = options.indexName
    this.stats = options.stats
  }
  _write(item, encoding, callback) {
    if (this.stats) this.stats.count += 1

    if (Object.keys(item.doc).length === 0) return callback()
    const opts = {
      index: this.indexName,
      type: 'line',
      id: item.id,
      body: {
        doc: item.doc
      }
    }
    this.esClient.update(opts, err => {
      if (err) {
        let message = err.message
        try {
          const res = JSON.parse(err.toJSON().response)
          if (res.error && res.error.reason) {
            message = res.error.reason
            if (res.error.caused_by && res.error.caused_by.reason) {
              message += ' - ' + res.error.caused_by.reason
            }
          }
        } catch (err) {
          // do nothing
        }
        return callback(new Error(message))
      }
      callback()
    })
  }
  _final(callback) {
    this.esClient.indices.refresh({index: this.indexName}, callback)
  }
}

// Apply an extension to a dataset: meaning, query a remote service in streaming manner
// and update the documents
exports.extend = async(app, dataset, extension, remoteService, action) => {
  const esClient = app.get('es')
  const db = app.get('db')
  const hashes = {}
  const extensionKey = getExtensionKey(remoteService.id, action.id)
  const indexName = es.indexName(dataset)

  const stats = {}

  const setProgress = async (error = '') => {
    try {
      const progress = stats.count / dataset.count
      await app.publish('datasets/' + dataset.id + '/extend-progress', {remoteService: remoteService.id, action: action.id, progress, error})
      await db.collection('datasets').updateOne({
        id: dataset.id,
        extensions: {$elemMatch: {'remoteService': remoteService.id, 'action': action.id}}
      }, {
        $set: {'extensions.$.progress': progress, 'extensions.$.error': error, 'extensions.$.forceNext': false}
      })
    } catch (err) {
      console.error('Failure to update progress of an extension', err)
    }
  }

  let progressInterval
  try {
    const opts = {
      method: action.operation.method,
      url: remoteService.server + action.operation.path,
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/x-ndjson'
      },
      qs: {}
    }
    // TODO handle query & cookie header types
    if (remoteService.apiKey.in === 'header') {
      if (remoteService.apiKey.value) {
        opts.headers[remoteService.apiKey.name] = remoteService.apiKey.value
      } else if (config.defaultRemoteKey) {
        opts.headers[remoteService.apiKey.name] = config.defaultRemoteKey
      }
    }
    // transmit organization id as it tends to complement authorization information
    if (remoteService.owner.type === 'organization') {
      opts.headers['x-organizationId'] = remoteService.owner.id
    }
    if (remoteService.owner.type === 'user') {
      opts.headers['x-userId'] = remoteService.owner.id
    }
    if (extension.select && extension.select.length) {
      opts.qs.select = extension.select.join(',')
    }
    const inputStream = new ESInputStream({esClient, indexName, forceNext: extension.forceNext, extensionKey, stats})
    await inputStream.init()
    stats.count = dataset.count - stats.missing
    await setProgress()
    progressInterval = setInterval(setProgress, 600)
    if (stats.missing !== 0) {
      await pump(
        inputStream,
        new PrepareInputStream({action, dataset, hashes, extensionKey, selectFields: extension.select, stats}),
        request(opts),
        byline.createStream(),
        new PrepareOutputStream({action, hashes, extensionKey, selectFields: extension.select}),
        new ESOutputStream({esClient, indexName, stats})
      )
    }
    await setProgress()
    clearInterval(progressInterval)
  } catch (err) {
    // catch the error, as a failure to use remote service should not prevent the dataset
    // to be processed and used
    console.error('Failure to extend using remote service', err.message)
    clearInterval(progressInterval)
    await setProgress(err.message)
  }
}

// A stream that takes documents from a dataset (read from ES), applies some calculations
// And returns a doc to apply to the document
class CalculatedExtension extends Transform {
  constructor(options) {
    super({objectMode: true})
    this.options = options
  }
  _transform(item, encoding, callback) {
    const doc = {}
    // "hidden" fields for geo indexing
    try {
      if (this.options.geometry) {
        Object.assign(doc, geoUtils.geometry2fields(this.options.dataset.schema, item.doc))
      } else if (this.options.geopoint) {
        Object.assign(doc, geoUtils.latlon2fields(this.options.dataset.schema, item.doc))
      }
    } catch (err) {
      return callback(err)
    }

    const unflattenedItem = flatten.unflatten(item.doc)
    Object.keys(doc).forEach(key => {
      if (JSON.stringify(doc[key]) === JSON.stringify(unflattenedItem[key])) {
        delete doc[key]
      }
    })

    callback(null, {id: item.id, doc})
  }
}

exports.extendCalculated = async (app, dataset, geopoint, geometry) => {
  const indexName = es.indexName(dataset)
  const esClient = app.get('es')
  return pump(
    new ESInputStream({esClient, indexName}),
    new CalculatedExtension({indexName, geopoint, geometry, dataset}),
    new ESOutputStream({esClient, indexName})
  )
}

exports.prepareSchema = async (db, schema, extensions) => {
  let extensionsFields = []
  for (let extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    const action = remoteService.actions.find(action => action.id === extension.action)
    if (!action) continue
    const extensionKey = getExtensionKey(extension.remoteService, extension.action)
    const extensionId = `${extension.remoteService}/${extension.action}`
    const selectFields = extension.select || []
    extensionsFields = extensionsFields.concat(action.output
      .filter(output => !output.concept || output.concept !== 'http://schema.org/identifier')
      .filter(output => selectFields.length === 0 || selectFields.includes(output.name))
      .map(output => {
        const key = extensionKey + '.' + output.name
        const existingField = schema.find(field => field.key === key)
        if (existingField) return existingField
        return {
          key,
          'x-originalName': output.name,
          'x-extension': extensionId,
          'x-refersTo': output.concept,
          title: output.title,
          description: output.description,
          type: output.type || 'string'
        }
      }))
  }
  return schema.filter(field => !field['x-extension']).concat(extensionsFields)
}

function getExtensionKey(remoteServiceId, actionId) {
  return `_ext_${remoteServiceId}_${actionId}`
}
