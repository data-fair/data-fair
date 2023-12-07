const config = require('config')
const pump = require('./pipe')
const fs = require('fs-extra')
const { Transform } = require('stream')
const stringify = require('json-stable-stringify')
const flatten = require('flat')
const createError = require('http-errors')
const axios = require('./axios')
const datasetUtils = require('./dataset')
const restDatasetsUtils = require('./rest-datasets')
const geoUtils = require('./geo')
const { bulkSearchPromise, bulkSearchStreams } = require('./master-data')
const taskProgress = require('./task-progress')
const permissionsUtils = require('./permissions')

const debug = require('debug')('extensions')

// Apply an extension to a dataset: meaning, query a remote service in batches
// and add the result either to a "full" file or to the collection in case of a rest dataset
exports.extend = async (app, dataset, extensions) => {
  const db = app.get('db')
  const es = app.get('es')
  const detailedExtensions = []
  for (const extension of extensions) {
    if (!extension.active) continue
    if (extension.type === 'remoteService') {
      const accessFilter = [{ public: true }]
      accessFilter.push({ privateAccess: { $elemMatch: { type: dataset.owner.type, id: dataset.owner.id } } })
      const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService, $or: accessFilter })
      if (!remoteService) {
        throw new Error(`Try to apply extension on dataset ${dataset.id} but remote service ${extension.action} was not found.`)
      }
      const action = remoteService.actions.find(a => a.id === extension.action)
      if (!action) {
        throw new Error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      }

      const extensionKey = exports.getExtensionKey(extension)
      const inputMapping = prepareInputMapping(action, dataset, extensionKey, extension.select)
      const errorKey = action.output.find(o => o.name === '_error') ? '_error' : 'error'
      const idInput = action.input.find(input => input.concept === 'http://schema.org/identifier')
      if (!idInput) throw new Error('A field with concept "http://schema.org/identifier" is required and missing in the remote service action', action)
      detailedExtensions.push({ ...extension, extensionKey, inputMapping, remoteService, action, errorKey, idInput })
    } else if (extension.type === 'exprEval') {
      const { parser } = require('../../shared/expr-eval')
      try {
        const parsedExpression = parser.parse(extension.expr)
        detailedExtensions.push({
          ...extension,
          evaluate: (data) => parsedExpression.evaluate(data)
        })
      } catch (err) {
        throw new Error(`[noretry] échec de l'analyse de l'expression "${extension.expr}" : ${err.message}`)
      }
    }
  }
  if (!detailedExtensions.length) {
    console.log('No extension to apply')
    return
  }

  let inputStreams
  const progress = taskProgress(app, dataset.id, 'extend', 100)
  await progress(0)
  if (dataset.isRest) {
    inputStreams = await restDatasetsUtils.readStreams(db, dataset, dataset.status === 'updated' ? { _needsExtending: true } : {}, progress)
  } else {
    inputStreams = await datasetUtils.readStreams(db, dataset, false, false, false, progress)
  }

  const writeStreams = await datasetUtils.writeExtendedStreams(db, dataset)
  await pump(
    ...inputStreams,
    new ExtensionsStream({ extensions: detailedExtensions, dataset, db, es }),
    ...writeStreams
  )
  const filePath = writeStreams[writeStreams.length - 1].path
  if (filePath) await fs.move(filePath, datasetUtils.fullFilePath(dataset), { overwrite: true })

  debug('Extension is over')
}

// Perform HTTP requests to a remote service to extend data
class ExtensionsStream extends Transform {
  constructor ({ extensions, dataset, db, es }) {
    super({ objectMode: true })
    this.i = 0
    this.dataset = dataset
    this.extensions = extensions
    this.db = db
    this.es = es
    this.buffer = []
  }

  async _transform (item, encoding, callback) {
    try {
      this.i += 1
      this.buffer.push(item)
      if (this.i % 1000 === 0) await this._sendBuffer()
      callback()
    } catch (err) {
      callback(err)
    }
  }

  async _flush (callback) {
    try {
      await this._sendBuffer()
      callback()
    } catch (err) {
      callback(err)
    }
  }

  async _sendBuffer () {
    if (!this.buffer.length) return
    if (global.events) global.events.emit('extension-inputs', this.buffer.length)

    for (const extension of this.extensions) {
      debug(`Send req with ${this.buffer.length} items`, this.reqOpts)
      if (extension.type === 'remoteService') {
        const opts = {
          method: extension.action.operation.method,
          url: extension.remoteService.server.replace(config.remoteServicesPrivateMapping[0], config.remoteServicesPrivateMapping[1]) + extension.action.operation.path,
          headers: {
            Accept: 'application/x-ndjson',
            'Content-Type': 'application/x-ndjson'
          },
          params: {},
          responseType: 'text',
          data: ''
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
        const inputs = []
        for (const i in this.buffer) {
          const input = await extension.inputMapping(this.buffer[i])
          input[extension.idInput.name] = i
          inputs.push(input)
        }

        const localMasterData = extension.remoteService.server.startsWith(`${config.publicUrl}/api/v1/datasets/`)

        // TODO: no need to use a cache in the special case of a locale master-data dataset ?
        const inputCacheKeys = inputs.map(input => stringify([input, extension.select || []]))
        const extensionCacheKey = extension.remoteService + '/' + extension.action
        // first get previous results from cache
        for (let i = 0; i < inputs.length; i++) {
          if (Object.keys(inputs[i]).length === 1) continue
          let cachedValue
          if (!localMasterData) {
          // TODO: read cached values in a bulk read ?
            cachedValue = (await this.db.collection('extensions-cache')
              .findOneAndUpdate({ extensionKey: extensionCacheKey, input: inputCacheKeys[i] }, { $set: { lastUsed: new Date() } })).value
          }

          if (cachedValue) this.buffer[i][extension.extensionKey] = cachedValue.output
          else opts.data += JSON.stringify(inputs[i]) + '\n'
        }
        if (!opts.data) continue

        // query the missing results using HTTP or request to remote service or local stream to local service
        let data
        if (localMasterData) {
          const masterDatasetId = extension.remoteService.server.replace(`${config.publicUrl}/api/v1/datasets/`, '')
          const pseudoUser = { name: 'extension' }
          if (this.dataset.owner.type === 'user') {
            pseudoUser.id = this.dataset.owner.id
            pseudoUser.organizations = []
            pseudoUser.activeAccount = { ...this.dataset.owner, role: 'admin' }
          } else {
            pseudoUser.id = '_master-data'
            pseudoUser.organizations = [{ ...this.dataset.owner, role: 'user' }]
            pseudoUser.activeAccount = pseudoUser.organizations[0]
          }
          const masterDataset = await this.db.collection('datasets').findOne({ id: masterDatasetId })
          if (!masterDataset) throw new Error('jeu de données de référence inconnu ' + masterDatasetId)
          if (!permissionsUtils.list('datasets', masterDataset, pseudoUser).includes('readLines')) {
            throw new Error(`[noretry] permission manquante sur le jeu de données de référence "${masterDataset.slug}" (${masterDataset.id})`)
          }
          const bulkSearchId = extension.action.id.replace('masterData_bulkSearch_', '')
          data = await bulkSearchPromise(
            await bulkSearchStreams(this.db, this.es, masterDataset, 'application/x-ndjson', bulkSearchId, opts.params.select),
            opts.data
          )
        } else {
          data = (await axios(opts)).data
        }
        if (typeof data === 'object') data = JSON.stringify(data) // axios parses the object when there is only one
        const results = data.split('\n').filter(line => !!line).map(JSON.parse)
        for (const result of results) {
          const selectFields = extension.select || []
          const selectedResult = Object.keys(result)
            .filter(key => selectFields.length === 0 || selectFields.includes(key) || key === extension.errorKey)
            .filter(key => !!this.dataset.schema.find(p => p.key === extension.extensionKey + '.' + key))
            .reduce((a, key) => { a[key] = result[key]; return a }, {})

          const i = result[extension.idInput.name]
          this.buffer[i][extension.extensionKey] = selectedResult
          if (!localMasterData) {
            // TODO: do this in bulk ?
            await this.db.collection('extensions-cache')
              .replaceOne(
                { extensionKey: extensionCacheKey, input: inputCacheKeys[i] },
                { extensionKey: extensionCacheKey, input: inputCacheKeys[i], lastUsed: new Date(), output: selectedResult },
                { upsert: true }
              )
          }
        }
      } else if (extension.evaluate && extension.property) {
        for (const i in this.buffer) {
          let value
          try {
            const data = { ...this.buffer[i] }
            // WARNING: this code is duplicated in server/utils/extensions.js
            for (const prop of this.dataset.schema) {
              const ext = this.dataset.extensions?.find(e => prop.key.startsWith(exports.getExtensionKey(e) + '.'))
              if (ext) {
                const extKey = exports.getExtensionKey(ext)
                data[extKey] = data[extKey] ? { ...data[extKey] } : {}
                const shortKey = prop.key.replace(extKey + '.', '')
                data[extKey][shortKey] = data[extKey][shortKey] ?? null
              } else {
                data[prop.key] = data[prop.key] ?? null
              }
            }
            value = extension.evaluate(data)
          } catch (err) {
            throw new Error(`[noretry] échec de l'évaluation de l'expression "${extension.expr}" : ${err.message}`)
          }
          if (value !== null && value !== undefined) {
            if (extension.property.type === 'boolean') value = !!(value)
            if (extension.property.type === 'string') value = '' + value
            if (['number', 'integer'].includes(extension.property.type)) {
              value = Number(value)
              if (isNaN(value)) continue
              if (extension.property.type === 'integer') value = Math.round(value)
            }
            this.buffer[i][extension.property.key] = value
          }
        }
      }
    }

    for (const item of this.buffer) {
      this.push(item)
    }

    this.buffer = []
  }
}

exports.getExtensionKey = require('../../shared/utils/extensions').getExtensionKey

// Create a function that will transform items from a dataset into inputs for an action
function prepareInputMapping (action, dataset, extensionKey, selectFields) {
  const fieldMappings = action.input.map(input => {
    const field = dataset.schema.find(f =>
      f['x-refersTo'] === input.concept &&
      f['x-refersTo'] !== 'http://schema.org/identifier' &&
      f.key.indexOf(extensionKey) !== 0
    )
    return field && [field.key, input.name, field]
  }).filter(i => i)
  return async (item) => {
    const mappedItem = {}
    if (fieldMappings.find(mapping => mapping[0].startsWith('_geo'))) {
      // calculate geopoint and geometry fields depending on concepts
      if (geoUtils.schemaHasGeopoint(dataset.schema)) {
        Object.assign(item, geoUtils.latlon2fields(dataset, item))
      } else if (geoUtils.schemaHasGeometry(dataset.schema)) {
        Object.assign(item, await geoUtils.geometry2fields(dataset, item))
      }
    }
    const flatItem = flatten(item) // in case the input comes from another extension
    for (const mapping of fieldMappings) {
      const val = flatItem[mapping[0]]
      if (val !== undefined && val !== '') mappedItem[mapping[1]] = val
    }
    return mappedItem
  }
}

// add properties to the schema based on active extensions
exports.prepareSchema = async (db, schema, extensions) => {
  let extensionsFields = []
  await exports.checkExtensions(db, schema, extensions)
  for (const extension of extensions) {
    if (!extension.active) continue
    if (extension.type === 'remoteService') {
      const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
      if (!remoteService) continue
      const action = remoteService.actions.find(action => action.id === extension.action)
      if (!action) continue
      // ignore extensions with missing input
      if (!action.input.find(i => i.concept && schema.concat(extensionsFields).find(prop => prop['x-refersTo'] && prop['x-refersTo'] === i.concept))) {
        continue
      }
      const extensionKey = exports.getExtensionKey(extension)
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
          // this is for compatibility, new extensions should always have propertyPrefix
          const originalName = extension.propertyPrefix ? key : output.name
          const field = {
            key,
            'x-originalName': originalName,
            'x-extension': extensionId,
            title: output.title || '',
            description: output.description || '',
            type: output.type || 'string'
          }
          // only keep the concept if it does not conflict with existing property
          if (output.concept && !schema.find(f => !f['x-extension'] && f['x-refersTo'] === output.concept)) {
            field['x-refersTo'] = output.concept
          }
          if (output['x-capabilities']) field['x-capabilities'] = output['x-capabilities']
          if (output['x-labels']) field['x-labels'] = output['x-labels']
          return field
        }))
      const errorField = action.output.find(o => o.name === '_error') || action.output.find(o => o.name === 'error')

      extensionsFields.push({
        key: extensionKey + '.' + (errorField ? errorField.name : 'error'),
        type: 'string',
        'x-originalName': (errorField ? errorField.name : 'error'),
        'x-extension': extensionId,
        title: (errorField && errorField.title) || 'Erreur d\'enrichissement',
        description: (errorField && errorField.description) || 'Une erreur lors de la récupération des informations depuis un service distant',
        'x-calculated': true
      })
    } else if (extension.property) {
      const existingProperty = schema.find(p => p.key === extension.property.key)
      if (existingProperty && !existingProperty['x-extension']) throw createError(400, `Une extension essaie de créer la colonne "${extension.property.key}" mais cette clé est déjà utilisée.`)
      const fullProperty = existingProperty ? { ...existingProperty } : { ...extension.property }
      fullProperty['x-extension'] = extension.property.key
      extensionsFields.push(fullProperty)
    }
  }
  return schema.filter(field => !field['x-extension']).concat(extensionsFields)
}

// check if and extension dosn't have the necessary input
exports.checkExtensions = async (db, schema, extensions = []) => {
  // console.log('schema', schema)
  const availableConcepts = new Set(schema.map(prop => prop['x-refersTo']).filter(c => c))

  for (const extension of extensions) {
    if (extension.type === 'remoteService') {
      const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
      if (!remoteService) throw createError(400, '[noretry] source de données de référénce inconnue')
      const action = remoteService.actions.find(action => action.id === extension.action)
      if (!action) throw createError(400, '[noretry] opération de récupération de données de référénce inconnue')
      if (!action.input.find(i => i.concept && availableConcepts.has(i.concept))) {
        throw createError(400, `[noretry] le concept nécessaire à l'utilisation de la donnée de référence n'est pas présent dans le jeu de données (${action.summary})`)
      }
      for (const concept of action.output.map(i => i.concept).filter(c => c)) availableConcepts.add(concept)
    } else if (extension.type === 'exprEval') {
      return null
    }
  }
  return null
}
