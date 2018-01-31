const eventToPromise = require('event-to-promise')
const axios = require('axios')
const ldj = require('ldjson-stream')
const es = require('./es')

const { Readable, Transform, Writable } = require('stream')

// Input stream scanning a full ES index using the scroll api
class ESInputStream extends Readable {
  constructor(options) {
    super({objectMode: true})
    this.client = options.client
    this.indexName = options.indexName
    this.keepPushing = true
  }
  async _read() {
    let res
    if (!this.scrollId) {
      res = await this.client.search({
        index: this.indexName,
        scroll: '100s',
        body: {query: {match_all: {}}}
      })
    } else {
      res = await this.client.scroll({scroll_id: this.scrollId, scroll: '100s'})
    }
    this.scrollId = res._scroll_id

    for (let hit of res.hits.hits) {
      this.keepPushing = this.push(hit)
    }

    if (res.hits.hits.length) {
      if (this.keepPushing) await this._read()
    } else {
      this.push(null)
    }
  }
}

// Maps input from documents to the expected parameters of a remote service action
class PrepareInputStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    const action = options.action
    const schema = options.dataset.schema

    this.mapping = action.input.map(input => {
      const field = schema.find(f => f['x-refersTo'] === input.concept)
      if (field) return [field.key, input.name]
    }).filter(i => i)
    this.idInput = action.input.find(input => input.concept === 'http://schema.org/identifier').name
  }
  _transform(item, encoding, callback) {
    const mappedItem = {}
    this.mapping.forEach(m => {
      mappedItem[m[1]] = item._source[m[0]]
    })
    mappedItem[this.idInput] = item._id
    callback(null, JSON.stringify(mappedItem) + '\n')
  }
}

// Maps output from a remote service action to new fields in the documents
class PrepareOutputStream extends Transform {
  constructor(options) {
    super({objectMode: true})
    const action = options.action
    this.idOutput = action.output.find(output => output.concept === 'http://schema.org/identifier').name
  }
  _transform(item, encoding, callback) {
    const mappedItem = {doc: item}
    mappedItem.id = item[this.idOutput]
    delete item[this.idOutput]
    callback(null, mappedItem)
  }
}

// Output stream performing partial doc updates in ES
class ESOutputStream extends Writable {
  constructor(options) {
    super({objectMode: true})
    this.client = options.client
    this.indexName = options.indexName
    this.keyPrefix = options.keyPrefix
  }
  async _write(item, encoding, callback) {
    const opts = {
      index: this.indexName,
      type: 'line',
      id: item.id,
      body: {
        doc: {
          [this.keyPrefix]: item.doc
        }
      }
    }
    this.client.update(opts, callback)
  }
}

exports.extend = async(client, dataset, remoteService, action) => {
  const inputStream = new ESInputStream({client, indexName: es.indexName(dataset)})
    .pipe(new PrepareInputStream({action, dataset}))
  const opts = {
    method: action.operation.method,
    baseURL: remoteService.server,
    url: action.operation.path,
    data: inputStream,
    responseType: 'stream',
    headers: {}
  }

  // TODO handle query & cookie header types
  if (remoteService.apiKey.in === 'header' && remoteService.apiKey.value) {
    opts.headers[remoteService.apiKey.name] = remoteService.apiKey.value
  }
  // transmit organization id as it tends to complement authorization information
  if (remoteService.owner.type === 'organization') {
    opts.headers['x-organizationId'] = remoteService.owner.id
  }

  const res = await axios(opts)
  const outputStream = res.data
    .pipe(ldj.parse())
    .pipe(new PrepareOutputStream({action}))
    .pipe(new ESOutputStream({client, indexName: es.indexName(dataset), keyPrefix: getPrefix(remoteService.id, action.id)}))
  await eventToPromise(outputStream, 'finish')
}

exports.prepareSchema = async (db, schema, extensions) => {
  for (let extension of extensions) {
    if (extension.active === false) continue
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    const action = remoteService.actions.find(action => action.id === extension.action)
    if (!action) continue
    const prefix = getPrefix(extension.remoteService, extension.action)
    if (!schema.find(field => field.key === prefix + '._error')) {
      schema.push({key: prefix + '._error', type: 'string'})
    }
    if (!schema.find(field => field.key === prefix + '._hash')) {
      schema.push({key: prefix + '._hash', type: 'string', format: 'uri-reference'})
    }

    for (let output of action.output) {
      if (!schema.find(field => field.key === prefix + output.name)) {
        // TODO : other types and format ?
        const field = {key: prefix + output.name, type: 'string'}
        if (output.concept) {
          field['x-refertsTo'] = output.concept
        }
        schema.push(field)
      }
    }
  }
  return schema
}

function getPrefix(remoteServiceId, actionId) {
  return `_ext_${remoteServiceId}_${actionId}`
}
