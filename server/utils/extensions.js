const eventToPromise = require('event-to-promise')
const axios = require('axios')
const byline = require('byline')
const hash = require('object-hash')
const promisePipe = require('promisepipe')
const { Readable, Transform, Writable } = require('stream')
const es = require('./es')

// Create a function that will transform items from a dataset into inputs for an action
function prepareMapping(action, schema, extensionKey) {
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
      mappedItem[m[1]] = item._source[m[0]]
    })
    // remember a hash of the input.. so that we can store it alongside the resul and use this to reapply
    // extension to a new version of the index without using the remote service
    const h = hash(mappedItem)
    mappedItem[idInput] = item._id
    return [mappedItem, h]
  }
}

// Maps input from documents to the expected parameters of a remote service action
class PrepareInputStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    this.hashes = options.hashes
    this.mapping = prepareMapping(options.action, options.dataset.schema, options.extensionKey)
  }
  _transform(item, encoding, callback) {
    const [mappedItem, h] = this.mapping(item)
    this.hashes[item._id] = h
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
    for (let extension of extensions) {
      if (!extension.active) return
      const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
      if (!remoteService) continue
      const action = remoteService.actions.find(action => action.id === extension.action)
      if (!action) continue
      const extensionKey = getExtensionKey(extension.remoteService, extension.action)
      this.mappings[extensionKey] = prepareMapping(action, this.options.dataset.schema, extensionKey)
    }
  }
  async _transform(item, encoding, callback) {
    try {
      if (!this.mappings) await this.init()
      const esClient = this.options.es
      for (let extensionKey in this.mappings) {
      /* eslint no-unused-vars: off */
        const [mappedItem, h] = this.mappings[extensionKey]({_source: item})
        const res = await esClient.search({
          index: this.indexName,
          body: {query: {constant_score: {filter: {term: {[extensionKey + '._hash']: h}}}}}
        })
        if (res.hits.total > 0) {
          item[extensionKey] = res.hits.hits[0]._source[extensionKey]
        }
      }
      callback(null, item)
    } catch (err) {
      callback(err)
    }
  }
}

exports.extendStream = (options) => new ExtendStream(options)

// Input stream scanning a full ES index using the scroll api
class ESInputStream extends Readable {
  constructor(options) {
    super({objectMode: true})
    this.esClient = options.esClient
    this.indexName = options.indexName
    this.keep = options.keep
    this.extensionKey = options.extensionKey
    this.stats = options.stats
    this.keepPushing = true
    this.i = 0
  }
  async _read() {
    try {
      let res
      if (!this.scrollId) {
        let query = {match_all: {}}
        if (this.keep) {
          query = {bool: {must_not: {exists: {field: this.extensionKey + '._hash'}}}}
        }
        res = await this.esClient.search({
          index: this.indexName,
          scroll: '100s',
          body: {query}
        })
        this.stats.count -= res.hits.total
      } else {
        res = await this.esClient.scroll({scroll_id: this.scrollId, scroll: '100s'})
      }
      this.scrollId = res._scroll_id

      for (let hit of res.hits.hits) {
        this.keepPushing = this.push(hit)
        this.i += 1
      }

      if (res.hits.total > this.i) {
        if (this.keepPushing) await this._read()
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
    const action = options.action
    this.idOutput = action.output.find(output => output.concept === 'http://schema.org/identifier').name
  }
  _transform(chunk, encoding, callback) {
    let item
    try {
      item = JSON.parse(chunk)
    } catch (err) {
      return callback(new Error('Bad content - ' + chunk))
    }
    const mappedItem = {doc: item}
    mappedItem.id = item[this.idOutput]
    item._hash = this.hashes[mappedItem.id]
    delete this.hashes[mappedItem.id]
    delete item[this.idOutput]
    callback(null, mappedItem)
  }
}

// Output stream performing partial doc updates in ES
class ESOutputStream extends Writable {
  constructor(options) {
    super({objectMode: true})
    this.esClient = options.esClient
    this.indexName = options.indexName
    this.extensionKey = options.extensionKey
    this.stats = options.stats
  }
  _write(item, encoding, callback) {
    this.stats.count += 1
    const opts = {
      index: this.indexName,
      type: 'line',
      id: item.id,
      body: {
        doc: {
          [this.extensionKey]: item.doc
        }
      }
    }
    this.esClient.update(opts, callback)
  }
  _final(callback) {
    this.esClient.indices.refresh({index: this.indexName}, callback)
  }
}

exports.extend = async(app, dataset, remoteService, action, keep, indexName) => {
  const esClient = app.get('es')
  const db = app.get('db')
  const hashes = {}
  const extensionKey = getExtensionKey(remoteService.id, action.id)

  const setProgress = async (error) => {
    try {
      const progress = dataset.count / stats.count
      await app.publish('datasets/' + dataset.id + '/extend-progress', {remoteService: remoteService.id, action: action.id, progress, error})
      await db.collection('datasets').updateOne({
        id: dataset.id,
        extensions: {$elemMatch: {'remoteService': remoteService.id, 'action': action.id}}
      }, {
        $set: {'extensions.$.progress': progress, 'extensions.$.error': error}
      })
    } catch (err) {
      console.error('Failure to update progress of an extension', err)
    }
  }

  const inputStream = new PrepareInputStream({action, dataset, hashes, extensionKey})
  const opts = {
    method: action.operation.method,
    baseURL: remoteService.server,
    url: action.operation.path,
    data: inputStream,
    responseType: 'stream',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/x-ndjson'
    }
  }

  // TODO handle query & cookie header types
  if (remoteService.apiKey.in === 'header' && remoteService.apiKey.value) {
    opts.headers[remoteService.apiKey.name] = remoteService.apiKey.value
  }
  // transmit organization id as it tends to complement authorization information
  if (remoteService.owner.type === 'organization') {
    opts.headers['x-organizationId'] = remoteService.owner.id
  }

  const stats = {count: dataset.count}
  const esInputStream = new ESInputStream({esClient, indexName, keep, extensionKey, stats})
  try {
    const inputPromise = promisePipe(esInputStream, inputStream)

    const res = await axios(opts)

    const outputPromise = promisePipe(
      res.data,
      byline.createStream(),
      new PrepareOutputStream({action, hashes}),
      new ESOutputStream({esClient, indexName, extensionKey, stats})
    )

    const progressInterval = setInterval(setProgress, 1000)
    await Promise.all([inputPromise, outputPromise])
    clearInterval(progressInterval)
    await setProgress()
  } catch (err) {
    await setProgress(err.message)
    esInputStream.unpipe(inputStream)
    esInputStream.destroy()
    throw err
  }
}

exports.prepareSchema = async (db, schema, extensions) => {
  for (let extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    const action = remoteService.actions.find(action => action.id === extension.action)
    if (!action) continue
    const prefix = getExtensionKey(extension.remoteService, extension.action)
    if (!schema.find(field => field.key === prefix + '._hash')) {
      schema.push({key: prefix + '._hash', type: 'string', format: 'uri-reference'})
    }

    for (let output of action.output) {
      if (!schema.find(field => field.key === prefix + output.name)) {
        const field = {
          key: prefix + '.' + output.name,
          'x-originalName': output.name,
          title: output.title || output.description,
          type: output.type || 'string'
        }
        if (output.concept && output.concept !== 'http://schema.org/identifier') {
          field['x-refersTo'] = output.concept
        }
        schema.push(field)
      }
    }
  }
  return schema
}

function getExtensionKey(remoteServiceId, actionId) {
  return `_ext_${remoteServiceId}_${actionId}`
}
