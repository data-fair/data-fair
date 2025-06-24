import config from '#config'
import mongo from '#mongo'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import i18n from 'i18n'
import pump from '../../misc/utils/pipe.ts'
import fs from 'fs-extra'
import { Transform, Writable } from 'stream'
import stringify from 'json-stable-stringify'
import { flatten } from 'flat'
import equal from 'deep-equal'
import axios from '../../misc/utils/axios.js'
import { fullFilePath, fsyncFile, attachmentPath } from './files.ts'
import { readStreams, writeExtendedStreams } from './data-streams.js'
import * as restDatasetsUtils from './rest.ts'
import * as geoUtils from './geo.js'
import * as schemaUtils from './data-schema.js'
import { bulkSearchPromise, bulkSearchStreams } from './master-data.js'
import taskProgress from './task-progress.ts'
import * as permissionsUtils from '../../misc/utils/permissions.ts'
import { getPseudoSessionState } from '../../misc/utils/users.js'
import randomSeed from 'random-seed'
import debugLib from 'debug'
import { parseURL } from 'ufo'
import exprEval from '@data-fair/data-fair-shared/expr-eval.js'
import { getExtensionKey } from '@data-fair/data-fair-shared/utils/extensions.js'
import * as fieldsSniffer from './fields-sniffer.js'
import intoStream from 'into-stream'
import { getFlatten } from './flatten.ts'
import type { Dataset, DatasetLine } from '#types'
import type { Document, Filter, WithId } from 'mongodb'
import { isRestDataset } from '#types/dataset/index.ts'

export { getExtensionKey } from '@data-fair/data-fair-shared/utils/extensions.js'

const debugMasterData = debugLib('master-data')
const debug = debugLib('extensions')
const debugOverwrite = debugLib('extensions-overwrite')

export const prepareExtensions = (locale: string, extensions: any[], oldExtensions: any[] = []) => {
  for (const e of extensions) {
    if (e.type === 'remoteService') {
      const oldExtension = oldExtensions.find((/** @type {any} */oldE) => oldE.remoteService === e.remoteService && oldE.action === e.action)
      if (oldExtension) {
        if (!equal(oldExtension.select, e.select)) e.needsUpdate = true
        if (!equal(oldExtension.overwrite, e.overwrite)) e.needsUpdate = true
      }
      if (!e.shortId && !e.propertyPrefix) {
        if (oldExtension) {
          // do not reprocess already assigned shortIds / propertyPrefixes to prevent compatibility break
          if (oldExtension.shortId) e.shortId = oldExtension.shortId
          if (oldExtension.propertyPrefix) e.propertyPrefix = oldExtension.propertyPrefix
        } else {
          // only apply to new extensions to prevent compatibility break
          let propertyPrefix = e.action.toLowerCase()
          for (const term of ['masterdata', 'find', 'bulk', 'search']) {
            propertyPrefix = propertyPrefix.replace(term, '')
          }
          for (const char of [':', '-', '.', ' ']) {
            propertyPrefix = propertyPrefix.replace(char, '_')
          }
          if (propertyPrefix.startsWith('post')) propertyPrefix = propertyPrefix.replace('post', '')
          e.propertyPrefix = propertyPrefix.replace(/__/g, '_').replace(/^_/, '').replace(/_$/, '')
          e.propertyPrefix = '_' + e.propertyPrefix

          e.needsUpdate = true

          // TODO: also check if there is a conflict with an existing calculate property ?
        }
      }
    }
    if (e.type === 'exprEval' && e.active) {
      const oldExtension = oldExtensions.find(oe => oe.type === 'exprEval' && oe.property?.key === e.property?.key)
      if (!oldExtension || (oldExtension && oldExtension.active && oldExtension.expr !== e.expr)) {
        e.needsUpdate = true
      }
    }
    if (e.nextUpdate && !e.autoUpdate) {
      delete e.nextUpdate
    }
  }
  const propertyPrefixes = extensions.filter(e => !!e.propertyPrefix).map(e => e.propertyPrefix)
  if (propertyPrefixes.length !== [...new Set(propertyPrefixes)].length) {
    throw httpError(400, i18n.__({ locale, phrase: 'errors.extensionShortIdConflict' }))
  }
}

// Apply an extension to a dataset: meaning, query a remote service in batches
// and add the result either to a "full" file or to the collection in case of a rest dataset
export const compileExpression = exprEval(config.defaultTimezone).compile
export const extend = async (
  dataset: Dataset,
  extensions: any[],
  updateMode?: 'updatedLines' | 'lineIds' | 'updatedExtensions',
  ignoreDraftLimit?: boolean,
  lineIds?: string[],
  simulationLine?: DatasetLine
) => {
  debugMasterData(`extend dataset ${dataset.id} (${dataset.slug})`, extensions)
  const detailedExtensions = []

  // TODO: move this in a small cache for performance in singleLine mode
  for (const extension of extensions) {
    if (!extension.active) continue
    if (extension.type === 'remoteService') {
      const accessFilter: Filter<WithId<Document>>[] = [{ public: true }]
      accessFilter.push({ privateAccess: { $elemMatch: { type: dataset.owner.type, id: dataset.owner.id } } })
      const remoteService = await mongo.db.collection('remote-services').findOne({ id: extension.remoteService, $or: accessFilter })
      if (!remoteService) {
        throw new Error(`Try to apply extension on dataset ${dataset.id} but remote service ${extension.action} was not found.`)
      }
      const action = remoteService.actions.find((a: any) => a.id === extension.action)
      if (!action) {
        throw new Error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      }

      const extensionKey = getExtensionKey(extension)
      const inputMapping = await prepareInputMapping(action, dataset, extensionKey, extension.select)
      const errorKey = action.output.find((o: any) => o.name === '_error') ? '_error' : 'error'
      const idInput = action.input.find((input: any) => input.concept === 'http://schema.org/identifier')
      if (!idInput) throw new Error('A field with concept "http://schema.org/identifier" is required and missing in the remote service action', action)
      detailedExtensions.push({ ...extension, extensionKey, inputMapping, remoteService, action, errorKey, idInput })
    } else if (extension.type === 'exprEval') {
      const property = dataset.schema?.find(p => p.key === extension.property.key)
      try {
        const evaluate = compileExpression(extension.expr, property)
        detailedExtensions.push({
          ...extension,
          evaluate
        })
      } catch (err: any) {
        throw new Error(`[noretry] échec de l'analyse de l'expression "${extension.expr}" : ${err.message}`)
      }
    }
  }
  if (!detailedExtensions.length) {
    debugMasterData('no extension to apply')
    return
  }

  let inputStreams
  const progress = updateMode !== 'lineIds' ? taskProgress(dataset.id, 'extend', 100) : undefined
  await progress?.inc(0)
  if (simulationLine) {
    inputStreams = [intoStream.object([simulationLine])]
  } else if (isRestDataset(dataset)) {
    let filter = {}
    if (updateMode === 'updatedLines') filter = { _needsExtending: true }
    else if (updateMode === 'lineIds') filter = { _id: { $in: lineIds } }
    inputStreams = await restDatasetsUtils.readStreams(dataset, filter, progress)
  } else {
    inputStreams = await readStreams(mongo.db, dataset, false, false, ignoreDraftLimit, progress)
  }

  let writeStreams
  if (simulationLine) {
    writeStreams = [new Writable({
      objectMode: true,
      write (extendedLine, encoding, callback) {
        Object.assign(simulationLine, extendedLine)
        callback()
      }
    })]
  } else {
    writeStreams = await writeExtendedStreams(dataset, extensions)
  }

  await pump(
    ...inputStreams,
    new ExtensionsStream({ extensions: detailedExtensions, dataset, onlyEmitChanges: updateMode === 'updatedExtensions' }),
    ...writeStreams
  )
  const filePath = writeStreams[writeStreams.length - 1].path
  if (filePath) {
    await fs.move(filePath, fullFilePath(dataset), { overwrite: true })
    await fsyncFile(fullFilePath(dataset))
  }

  debug('Extension is over')
}

const applyExtensionResult = (extensionKey: string, overwrittenKeys: string[][], item: any, selectedResult: any, onlyEmitChanges: boolean, separatorOutput: any[]) => {
  let hasChanges = false

  const objValue = (overwrittenKeys.length || separatorOutput.length) ? { ...selectedResult } : selectedResult

  for (const output of separatorOutput) {
    if (typeof objValue[output.name] === 'string') {
      objValue[output.name] = objValue[output.name].split(output['x-separator'].trim()).map((part: any) => part.trim())
    }
  }

  if (overwrittenKeys.length) debugOverwrite('apply overwritten keys to result', selectedResult)
  for (const [name, newKey] of overwrittenKeys) {
    if (onlyEmitChanges && !equal(item[newKey], objValue[name])) hasChanges = true
    item[newKey] = objValue[name]
    delete objValue[name]
  }
  if (overwrittenKeys.length) debugOverwrite('...altered result', selectedResult, item)

  if (onlyEmitChanges && !equal(item[extensionKey], objValue)) hasChanges = true
  item[extensionKey] = objValue

  return hasChanges
}

type ExtensionStreamOptions = {
  extensions: any[],
  dataset: Dataset,
  onlyEmitChanges: boolean
}

// Perform HTTP requests to a remote service to extend data
class ExtensionsStream extends Transform {
  i: number
  dataset: Dataset
  extensions: any[]
  onlyEmitChanges: boolean
  buffer: any[]
  constructor ({ extensions, dataset, onlyEmitChanges }: ExtensionStreamOptions) {
    super({ objectMode: true })
    this.i = 0
    this.dataset = dataset
    this.extensions = extensions
    this.onlyEmitChanges = onlyEmitChanges
    this.buffer = []
  }

  async transformPromise (item: any) {
    this.i += 1
    this.buffer.push(item)
    if (this.i % 1000 === 0) await this.sendBuffer()
  }

  _transform (item: any, encoding: BufferEncoding, cb: (err?: Error) => void) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.transformPromise(item).then(() => cb(), cb)
  }

  _flush (cb: (err?: Error) => void) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.sendBuffer().then(() => cb(), cb)
  }

  async sendBuffer () {
    if (!this.buffer.length) return
    // @ts-ignore
    if (global.events) global.events.emit('extension-inputs', this.buffer.length)

    const changesIndexes = new Set()

    for (const extension of this.extensions) {
      debug(`Send req with ${this.buffer.length} items`)
      if (extension.type === 'remoteService') {
        const overwrittenKeys = []
        if (extension.overwrite) {
          for (const name in extension.overwrite) {
            if (extension.overwrite[name]['x-originalName']) {
              const propKey = fieldsSniffer.escapeKey(extension.overwrite[name]['x-originalName'])
              overwrittenKeys.push([name, propKey])
            }
          }debugOverwrite('apply overwritten key from extension', overwrittenKeys)
        } else {
          debugOverwrite('no extension overwrite to apply')
        }

        const separatorOutput = extension.action.output.filter((o: any) => o['x-separator'])

        const opts: any = {
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
        debug('is extension local ?', localMasterData, extension.remoteService.server, `${config.publicUrl}/api/v1/datasets/`)

        // TODO: no need to use a cache in the special case of a locale master-data dataset ?
        const inputCacheKeys = inputs.map(input => stringify([input, extension.select || []]))
        const extensionCacheKey = extension.remoteService + '/' + extension.action
        // first get previous results from cache
        for (let i = 0; i < inputs.length; i++) {
          if (Object.keys(inputs[i]).length === 1) continue
          let cachedValue
          if (!localMasterData) {
            // TODO: read cached values in a bulk read ?
            cachedValue = await mongo.db.collection('extensions-cache')
              .findOneAndUpdate({ extensionKey: extensionCacheKey, input: inputCacheKeys[i] }, { $set: { lastUsed: new Date() } })
          }

          if (cachedValue) {
            const hasChanges = applyExtensionResult(extension.extensionKey, overwrittenKeys, this.buffer[i], cachedValue.output, this.onlyEmitChanges, separatorOutput)
            if (hasChanges) changesIndexes.add(i)
          } else opts.data += JSON.stringify(inputs[i]) + '\n'
        }
        if (!opts.data) continue

        // query the missing results using HTTP or request to remote service or local stream to local service
        let data
        if (localMasterData) {
          const masterDatasetId = extension.remoteService.server.replace(`${config.publicUrl}/api/v1/datasets/`, '')
          const pseudoSessionState = getPseudoSessionState(this.dataset.owner, 'extension', '_master-data', 'admin')
          const masterDataset = await mongo.db.collection('datasets').findOne({ id: masterDatasetId })
          if (!masterDataset) throw new Error('jeu de données de référence inconnu ' + masterDatasetId)
          if (!(permissionsUtils.list('datasets', masterDataset, pseudoSessionState) as string[]).includes('readLines')) {
            throw new Error(`[noretry] permission manquante sur le jeu de données de référence "${masterDataset.slug}" (${masterDataset.id})`)
          }
          const bulkSearchId = extension.action.id.replace('masterData_bulkSearch_', '')
          data = await bulkSearchPromise(
            await bulkSearchStreams(masterDataset, 'application/x-ndjson', bulkSearchId, opts.params.select, getFlatten(masterDataset)),
            opts.data
          )
        } else {
          data = (await axios(opts)).data
        }
        if (typeof data === 'object') data = JSON.stringify(data) // axios parses the object when there is only one
        const results = data.split('\n').filter((line: string) => !!line).map(JSON.parse)

        for (const result of results) {
          const selectFields = extension.select || []
          const selectedResult = Object.keys(result)
            .filter(key => ((selectFields.length === 0 && !!this.dataset.schema?.find(p => p.key === extension.extensionKey + '.' + key)) || selectFields.includes(key) || key === extension.errorKey))
            .reduce((a: any, key) => { a[key] = result[key]; return a }, {})

          const i = result[extension.idInput.name]
          if (!localMasterData) {
            // TODO: do this in bulk ?
            await mongo.db.collection('extensions-cache')
              .replaceOne(
                { extensionKey: extensionCacheKey, input: inputCacheKeys[i] },
                { extensionKey: extensionCacheKey, input: inputCacheKeys[i], lastUsed: new Date(), output: selectedResult },
                { upsert: true }
              )
          }

          const hasChanges = applyExtensionResult(extension.extensionKey, overwrittenKeys, this.buffer[i], selectedResult, this.onlyEmitChanges, separatorOutput)
          if (hasChanges) changesIndexes.add(i)
        }
      } else if (extension.evaluate && extension.property) {
        for (const i in this.buffer) {
          let value
          try {
            const data = { ...this.buffer[i] }
            // WARNING: this code is duplicated in server/utils/extensions.ts
            for (const prop of this.dataset.schema ?? []) {
              const ext = this.dataset.extensions?.find(e => prop.key.startsWith(getExtensionKey(e) + '.'))
              if (ext) {
                const extKey = getExtensionKey(ext)
                data[extKey] = data[extKey] ? { ...data[extKey] } : {}
                const shortKey = prop.key.replace(extKey + '.', '')
                data[extKey][shortKey] = data[extKey][shortKey] ?? null
              } else {
                // this check is probably only necessary for _updatedAt that is stored as a Date object in rest datasets
                // this should probably be fixed and we should only manipulate iso strings for dates
                if (data[prop.key] instanceof Date) data[prop.key] = data[prop.key].toISOString()
                else data[prop.key] = data[prop.key] ?? null
              }
            }
            value = extension.evaluate(data)
          } catch (err: any) {
            const message = `[noretry] échec de l'évaluation de l'expression "${extension.expr}" : ${err.message}`

            throw new Error(message)
          }
          if (this.onlyEmitChanges && !equal(this.buffer[i][extension.property.key], value)) {
            changesIndexes.add(i)
          }
          if (value !== null && value !== undefined) {
            this.buffer[i][extension.property.key] = value
          } else {
            delete this.buffer[i][extension.property.key]
          }
        }
      }
    }

    for (const i in this.buffer) {
      if (this.onlyEmitChanges && !changesIndexes.has(i)) continue
      this.push(this.buffer[i])
    }

    this.buffer = []
  }
}

// Create a function that will transform items from a dataset into inputs for an action
async function prepareInputMapping (action: any, dataset: Dataset, extensionKey: string, selectFields: string[]) {
  const schema = await schemaUtils.extendedSchema(mongo.db, dataset)
  const fieldMappings = action.input.map((input: any) => {
    const field = schema.find((f: any) =>
      f['x-refersTo'] === input.concept &&
      f['x-refersTo'] !== 'http://schema.org/identifier' &&
      f.key.indexOf(extensionKey + '.') !== 0
    )
    return field && [field.key, input.name, field]
  }).filter(Boolean)
  return async (item: any) => {
    const mappedItem: any = {}
    const flatItem = flatten<any, any>(item) // in case the input comes from another extension

    if (fieldMappings.find((mapping: any) => mapping[2]['x-calculated'])) {
      await applyCalculations(dataset, flatItem)
    }

    for (const mapping of fieldMappings) {
      const val = flatItem[mapping[0]]
      if (val !== undefined && val !== '') mappedItem[mapping[1]] = val
    }
    return mappedItem
  }
}

export const prepareExtensionsSchema = async (schema: any, extensions: any[]) => {
  let extensionsFields: any[] = []
  for (const extension of extensions) {
    if (!extension.active) continue
    if (extension.type === 'remoteService') {
      const remoteService = await mongo.db.collection('remote-services').findOne({ id: extension.remoteService })
      if (!remoteService) continue
      const action = remoteService.actions.find((action: any) => action.id === extension.action)
      if (!action) continue
      const extensionKey = getExtensionKey(extension)
      const extensionId = `${extension.remoteService}/${extension.action}`
      const selectFields = extension.select || []
      extensionsFields = extensionsFields.concat(action.output
        .filter((output: any) => !!output)
        .filter((output: any) => output.name !== 'error' && output.name !== '_error')
        .filter((output: any) => !output.concept || output.concept !== 'http://schema.org/identifier')
        .filter((output: any) => selectFields.length === 0 || selectFields.includes(output.name))
        .map((output: any) => {
          const overwrite = extension.overwrite?.[output.name] ?? {}
          const key = overwrite['x-originalName'] ? fieldsSniffer.escapeKey(overwrite['x-originalName']) : (extensionKey + '.' + output.name)
          // this is for compatibility, new extensions should always have propertyPrefix
          const originalName = overwrite['x-originalName'] ?? (extension.propertyPrefix ? key : output.name)
          // TODO: use SchemaProperty type
          const field: any = {
            key,
            'x-originalName': originalName,
            'x-extension': extensionId,
            title: output.title || '',
            description: output.description || '',
            type: output.type || 'string'
          }
          // only keep the concept if it does not conflict with existing property
          if (output.concept && !schema.find((f: any) => !f['x-extension'] && f['x-refersTo'] === output.concept)) {
            field['x-refersTo'] = output.concept
          }
          if (output['x-capabilities']) field['x-capabilities'] = output['x-capabilities']
          if (output['x-labels']) field['x-labels'] = output['x-labels']
          if (output['x-separator']) field.separator = output['x-separator']
          return field
        }))
      const errorField = action.output.find((o: any) => o.name === '_error') || action.output.find(o => o.name === 'error')

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
      const existingProperty = schema.find((p: any) => p.key === extension.property.key)
      if (existingProperty && !existingProperty['x-extension']) throw httpError(400, `Une extension essaie de créer la colonne "${extension.property.key}" mais cette clé est déjà utilisée.`)
      const fullProperty = existingProperty ? { ...existingProperty } : { ...extension.property }
      fullProperty['x-extension'] = extension.property.key
      extensionsFields.push(fullProperty)
    }
  }
  const newSchema: any[] = []
  for (const prop of schema) {
    if (prop['x-extension']) {
      const newExtProp = extensionsFields.find(f => f.key === prop.key)
      if (newExtProp) {
        if (prop.title) newExtProp.title = prop.title
        if (prop.description) newExtProp.description = prop.description
        newSchema.push(newExtProp)
      }
    } else {
      newSchema.push(prop)
    }
  }
  return newSchema.concat(extensionsFields.filter(p => !newSchema.some(p2 => p.key === p2.key)))
}

// check if and extension dosn't have the necessary input
export const checkExtensions = async (schema: any[], extensions: any[] = []) => {
  if (!extensions.some(e => e.active)) return null

  const availableConcepts = new Set(schema.map(prop => prop['x-refersTo']).filter(c => c))
  const previousExtensions = []
  const fullSchema = await prepareExtensionsSchema(schema, extensions)

  for (const extension of extensions) {
    if (!extension.active) continue
    if (geoUtils.schemaHasGeopoint(schema) || geoUtils.schemaHasGeometry(schema)) {
      availableConcepts.add('http://www.w3.org/2003/01/geo/wgs84_pos#lat_long')
    }

    if (extension.type === 'remoteService') {
      const remoteService = await mongo.db.collection('remote-services').findOne({ id: extension.remoteService })
      if (!remoteService) throw httpError(400, `[noretry] source de données de référénce inconnue "${extension.remoteService}"`)
      const action = remoteService.actions.find((action: any) => action.id === extension.action)
      if (!action) throw httpError(400, `[noretry] opération de récupération de données de référénce inconnue "${extension.remoteService} / ${extension.action?.replace('masterData_bulkSearch_', '')}"`)
      const errorPrefix = `[noretry] erreur de validation de l'extension "${action.summary}", `
      if (!action.input.find((i: any) => i.concept && availableConcepts.has(i.concept))) {
        throw httpError(400, `${errorPrefix}un concept nécessaire à l'utilisation de la donnée de référence n'est pas présent dans le jeu de données (${action.input.filter(i => i.concept && i.concept !== 'http://schema.org/identifier').map(i => i.concept).join(', ')})`)
      }
      for (const concept of action.output.map((i: any) => i.concept).filter(Boolean)) availableConcepts.add(concept)
    } else if (extension.property) {
      const errorPrefix = `[noretry] erreur de validation de la colonne calculée "${extension.property.key}", `
      const availableSchema = await prepareExtensionsSchema(schema, previousExtensions)
      const exprError = exprEval(config.defaultTimezone).check(extension.expr, availableSchema, fullSchema)
      if (exprError) throw httpError(400, `${errorPrefix}${exprError}`)
      const property = schema.find(p => p.key === extension.property.key)
      if (property?.['x-refersTo']) availableConcepts.add(property?.['x-refersTo'])
    }

    previousExtensions.push(extension)
  }
  return null
}

export const applyCalculations = async (dataset: Dataset, item: any) => {
  let warning = null
  const flatItem = flatten<any, any>(item, { safe: true })

  // Add base64 content of attachments
  const attachmentField = dataset.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (attachmentField && flatItem[attachmentField.key]) {
    const attachmentValue = flatItem[attachmentField.key]
    const isURL = !!parseURL(attachmentValue).host
    if (!isURL) {
      item._attachment_url = `${config.publicUrl}/api/v1/datasets/${dataset.id}/attachments/${attachmentValue}`
      const filePath = attachmentPath(dataset, attachmentValue)
      if (await fs.pathExists(filePath)) {
        const stats = await fs.stat(filePath)

        if (!attachmentField['x-capabilities'] || attachmentField['x-capabilities'].indexAttachment !== false) {
          if (stats.size > config.defaultLimits.attachmentIndexed) {
            warning = 'Pièce jointe trop volumineuse pour être analysée'
          } else {
            item._file_raw = (await fs.readFile(filePath)).toString('base64')
          }
        }
      }
    }
  }

  // calculate geopoint and geometry fields depending on concepts
  if (geoUtils.schemaHasGeopoint(dataset.schema)) {
    try {
      Object.assign(item, geoUtils.latlon2fields(dataset, flatItem))
    } catch (err: any) {
      console.log('failure to parse geopoints', dataset.id, err, flatItem)
      warning = 'Coordonnée géographique non valide - ' + err.message
    }
  } else if (geoUtils.schemaHasGeometry(dataset.schema)) {
    try {
      Object.assign(item, await geoUtils.geometry2fields(dataset, flatItem))
    } catch (err: any) {
      console.log('failure to parse geometry', dataset.id, err, flatItem)
      warning = 'Géométrie non valide - ' + err.message
    }
  }

  // Add a pseudo-random number for random sorting (more natural distribution)
  item._rand = randomSeed.create(dataset.id + item._i)(1000000)

  // split the fields that have a separator in their schema
  for (const field of dataset.schema ?? []) {
    if (field.separator && typeof item[field.key] === 'string') {
      item[field.key] = item[field.key].split((field.separator as string).trim()).map((part: string) => part.trim())
    }
  }
  return warning
}
