const config = require('config')
const util = require('util')
const pump = util.promisify(require('pump'))
const fs = require('fs-extra')
const { Transform } = require('stream')
const stringify = require('json-stable-stringify')
const axios = require('./axios')
const datasetUtils = require('./dataset')

const debug = require('debug')('extensions')

// Apply an extension to a dataset: meaning, query a remote service in batches
// and add the result either to a "full" file or to the collection in case of a rest dataset
exports.extend = async(app, dataset, extensions) => {
  const db = app.get('db')
  const detailedExtensions = []
  for (const extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
    if (!remoteService) {
      console.error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but remote service ${extension.action} was not found.`)
      continue
    }
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) {
      console.error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      continue
    }

    const extensionKey = getExtensionKey(remoteService.id, action.id)
    const inputMapping = prepareInputMapping(action, dataset.schema, extensionKey, extension.select)
    const errorKey = action.output.find(o => o.name === '_error') ? '_error' : 'error'
    const idInput = action.input.find(input => input.concept === 'http://schema.org/identifier')
    if (!idInput) throw new Error('A field with concept "http://schema.org/identifier" is required and missing in the remote service action', action)
    detailedExtensions.push({ ...extension, extensionKey, inputMapping, remoteService, action, errorKey, idInput })
  }
  if (!detailedExtensions.length) {
    console.log('No extension to apply')
    return
  }

  const inputStreams = datasetUtils.readStreams(dataset)
  const writeStreams = await datasetUtils.writeFullFileStreams(db, dataset)
  await pump(
    ...inputStreams,
    new RemoteExtensionStream({ extensions: detailedExtensions, dataset, db }),
    ...writeStreams,
  )
  const filePath = writeStreams[writeStreams.length - 1].path
  if (filePath) await fs.move(filePath, datasetUtils.fullFileName(dataset), { overwrite: true })

  debug('Extension is over')
}

// Perform HTTP requests to a remote service to extend data
class RemoteExtensionStream extends Transform {
  constructor({ extensions, dataset, db }) {
    super({ objectMode: true })
    this.i = 0
    this.dataset = dataset
    this.extensions = extensions
    this.db = db
    this.buffer = []
  }

  async _transform(item, encoding, callback) {
    try {
      this.i += 1
      this.buffer.push(item)
      if (this.i % 1000 === 0) await this._sendBuffer()
      callback()
    } catch (err) {
      callback(err)
    }
  }

  async _flush(callback) {
    try {
      await this._sendBuffer()
      callback()
    } catch (err) {
      callback(err)
    }
  }

  async _sendBuffer() {
    if (!this.buffer.length) return
    for (const extension of this.extensions) {
      debug(`Send req with ${this.buffer.length} items`, this.reqOpts)
      const opts = {
        method: extension.action.operation.method,
        url: extension.remoteService.server + extension.action.operation.path,
        headers: {
          Accept: 'application/x-ndjson',
          'Content-Type': 'application/x-ndjson',
          'x-consumer': JSON.stringify(this.dataset.owner),
        },
        params: {},
        responseType: 'text',
        data: '',
      }
      // TODO handle query & cookie header types
      if (extension.remoteService.apiKey && extension.remoteService.apiKey.in === 'header' && extension.remoteService.apiKey.value) {
        opts.headers[extension.remoteService.apiKey.name] = extension.remoteService.apiKey.value
      } else if (config.defaultRemoteKey.in === 'header' && config.defaultRemoteKey.value) {
        opts.headers[config.defaultRemoteKey.name] = config.defaultRemoteKey.value
      }
      if (extension.select && extension.select.length) {
        opts.params.select = extension.select.join(',')
      }
      const inputs = this.buffer
        .map(extension.inputMapping)
        .map((input, i) => {
          input[extension.idInput.name] = i
          return input
        })
      const inputCacheKeys = inputs.map(input => stringify([input, extension.select || []]))

      // first get previous results from cache
      for (let i = 0; i < inputs.length; i++) {
        if (Object.keys(inputs[i]).length === 1) continue
        const { value } = await this.db.collection('extensions-cache')
          .findOneAndUpdate({ extensionKey: extension.extensionKey, input: inputCacheKeys[i] }, { $set: { lastUsed: new Date() } })
        if (value) this.buffer[i][extension.extensionKey] = value.output
        else opts.data += JSON.stringify(inputs[i]) + '\n'
      }
      if (!opts.data) continue

      // query the missing results using HTTP request to remote service
      let data = (await axios(opts)).data
      if (typeof data === 'object') data = JSON.stringify(data) // axios parses the object when there is only one
      const results = data.split('\n').filter(line => !!line).map(JSON.parse)

      for (const result of results) {
        const selectFields = extension.select || []
        const selectedResult = Object.keys(result)
          .filter(key => selectFields.length === 0 || selectFields.includes(key) || key === extension.errorKey)
          .reduce((a, key) => { a[key] = result[key]; return a }, {})

        const i = result[extension.idInput.name]
        this.buffer[i][extension.extensionKey] = selectedResult
        await this.db.collection('extensions-cache')
          .replaceOne(
            { extensionKey: extension.extensionKey, input: inputCacheKeys[i] },
            { extensionKey: extension.extensionKey, input: inputCacheKeys[i], lastUsed: new Date(), output: selectedResult },
            { upsert: true },
          )
      }
    }

    for (const item of this.buffer) {
      this.push(item)
    }

    this.buffer = []
  }
}

function getExtensionKey(remoteServiceId, actionId) {
  return `_ext_${remoteServiceId}_${actionId}`
}

// Create a function that will transform items from a dataset into inputs for an action
function prepareInputMapping(action, schema, extensionKey, selectFields) {
  const fields = action.input.map(input => {
    const field = schema.find(f =>
      f['x-refersTo'] === input.concept &&
      f['x-refersTo'] !== 'http://schema.org/identifier' &&
      f.key.indexOf(extensionKey) !== 0,
    )
    if (field) return [field.key, input.name, field]
  }).filter(i => i)
  return (item) => {
    const mappedItem = {}
    fields.forEach(m => {
      const val = item[m[0]]
      if (val !== undefined && val !== '') mappedItem[m[1]] = val
    })
    return mappedItem
  }
}

// add properties to the schema based on active extensions
exports.prepareSchema = async (db, schema, extensions) => {
  let extensionsFields = []
  for (const extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
    if (!remoteService) continue
    const action = remoteService.actions.find(action => action.id === extension.action)
    if (!action) continue
    const extensionKey = getExtensionKey(extension.remoteService, extension.action)
    const extensionId = `${extension.remoteService}/${extension.action}`
    const selectFields = extension.select || []
    extensionsFields = extensionsFields.concat(action.output
      .filter(output => !!output)
      .filter(output => output.name !== 'error' && output.name !== '_error')
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
          type: output.type || 'string',
        }
      }))
    const errorField = action.output.find(o => o.name === '_error') || action.output.find(o => o.name === 'error')

    extensionsFields.push({
      key: extensionKey + '.' + (errorField ? errorField.name : 'error'),
      type: 'string',
      'x-originalName': (errorField ? errorField.name : 'error'),
      'x-extension': extensionId,
      title: (errorField && errorField.title) || 'Erreur d\'enrichissement',
      description: (errorField && errorField.description) || 'Une erreur lors de la récupération des informations depuis un service distant',
      'x-calculated': true,
    })
  }
  return schema.filter(field => !field['x-extension']).concat(extensionsFields)
}
