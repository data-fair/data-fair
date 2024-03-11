const config = /** @type {any} */(require('config'))
const createError = require('http-errors')
const equal = require('deep-equal')
const vocabulary = require('../../../contract/vocabulary.json')
const geoUtils = require('./geo')
const i18nUtils = require('../../i18n/utils')
const settingsUtils = require('../../misc/utils/settings')

const capabilitiesSchema = require('../../../contract/capabilities.js')
const capabilitiesDefaultFalse = Object.keys(capabilitiesSchema.properties).filter(key => capabilitiesSchema.properties[key]?.default === false)

/**
 *
 * @param {any[]} schema
 * @param {Record<string, string>} reqQuery
 */
exports.filterSchema = (schema, reqQuery) => {
  if (reqQuery.type) {
    const types = reqQuery.type.split(',')
    schema = schema.filter(field => types.includes(field.type))
  }
  if (reqQuery.format) {
    const formats = reqQuery.format.split(',')
    schema = schema.filter(field => formats.includes(field.format))
  }
  if (reqQuery.enum === 'true') {
    schema = schema.filter(field => !!field.enum)
  }
  if (reqQuery.concept === 'true') {
    schema = schema.filter(field => !!field['x-concept'])
  }

  // in json schema format we remove calculated and extended properties by default (better matches the need of form generation)
  const filterCalculated = reqQuery.mimeType === 'application/schema+json' ? reqQuery.calculated !== 'true' : reqQuery.calculated === 'false'
  if (filterCalculated) {
    schema = schema.filter(field => !field['x-calculated'])
  }
  const filterExtension = reqQuery.mimeType === 'application/schema+json' ? reqQuery.extension !== 'true' : reqQuery.extension === 'false'
  if (filterExtension) {
    schema = schema.filter(field => !field['x-extension'])
  }
  if (reqQuery.separator === 'false') {
    schema = schema.filter(field => !field.separator)
  }
  if (reqQuery.capability) {
    schema = schema.filter(field => {
      if (capabilitiesDefaultFalse.includes(reqQuery.capability)) {
        if (!field['x-capabilities'] || !field['x-capabilities'][reqQuery.capability]) return false
      } else {
        if (field['x-capabilities'] && field['x-capabilities'][reqQuery.capability] === false) return false
      }

      if (field.key === '_id') return false
      if (reqQuery.capability.startsWith('text') && field.type !== 'string') return false
      if (reqQuery.capability === 'insensitive' && field.type !== 'string') return false
      if (field.type === 'string' && (field.format === 'date' || field.format === 'date-time')) {
        if (reqQuery.capability === 'text') return false
        if (reqQuery.capability === 'textAgg') return false
        if (reqQuery.capability === 'wildcard') return false
        if (reqQuery.capability === 'insensitive') return false
      }
      return true
    })
  }
  if (reqQuery.maxCardinality) {
    const maxCardinality = Number(reqQuery.maxCardinality)
    schema = schema.filter(field => field['x-cardinality'] != null && field['x-cardinality'] <= maxCardinality)
  }
  return schema
}

exports.mergeFileSchema = (dataset) => {
  dataset.schema = dataset.schema || []
  const fileFields = dataset.file.schema
    .map(field => {
      // preserve existing fields customization
      const existingField = dataset.schema.find(f => f.key === field.key && !f['x-extension'])
      if (existingField) return existingField
      const { dateFormat, dateTimeFormat, ...f } = field
      // manage default capabilities
      if (field.type === 'string' && field['x-display'] === 'textarea') f['x-capabilities'] = { index: false, values: false, insensitive: false }
      if (field.type === 'string' && field['x-display'] === 'markdown') f['x-capabilities'] = { index: false, values: false, insensitive: false }
      return f
    })

  // keep extension fields
  const extensionFields = dataset.schema.filter(field => field['x-extension'])
  for (const field of extensionFields) {
    if (fileFields.find(f => f.key === field.key)) throw createError(400, `[noretry] Une extension essaie de créer la colonne "${field.key}" mais cette clé est déjà utilisée.`)
  }
  dataset.schema = fileFields.concat(extensionFields)
}

exports.cleanSchema = (dataset) => {
  const schema = dataset.schema = dataset.schema || []
  const fileSchema = dataset.file && dataset.file.schema
  for (const f of schema) {
    // restore original type and format, in case of removal of a concept
    // or updated fields in latest file
    const fileField = fileSchema && fileSchema.find(ff => ff.key === f.key)
    if (fileField && (fileField.type !== f.type || fileField.format !== f.format)) {
      f.type = fileField.type
      if (!fileField.format) delete f.format
      else f.format = fileField.format
    }

    // apply type from concepts to the actual field (for example SIRET might be parsed a interger, but should be returned a string)
    if (f['x-refersTo']) {
      const concept = vocabulary.find(c => c.identifiers.includes(f['x-refersTo']))
      // forcing other types than string is more dangerous, for now lets do just that
      if (concept && concept.type === 'string') {
        f.type = concept.type
        if (concept.format) {
          if (concept.format === 'date-time' && f.format === 'date') {
            // special case, concepts with date-time format also accept date format
          } else {
            f.format = concept.format
          }
        }
      }
    }
  }
  return schema
}

const latlonUri = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'

exports.extendedSchema = async (db, dataset, fixConcept = true) => {
  exports.cleanSchema(dataset)
  const schema = dataset.schema.filter(f => f['x-extension'] || !f['x-calculated'])
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty) {
    if (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false) {
      schema.push({ 'x-calculated': true, key: '_file.content', type: 'string', title: 'Contenu textuel du fichier', description: 'Résultat d\'une extraction automatique' })
      schema.push({ 'x-calculated': true, key: '_file.content_type', type: 'string', title: 'Type mime du fichier', description: 'Résultat d\'une détection automatique.' })
      schema.push({ 'x-calculated': true, key: '_file.content_length', type: 'integer', title: 'La taille en octet du fichier', description: 'Résultat d\'une détection automatique.' })
    }
    if (dataset.attachmentsAsImage) {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: 'URL de téléchargement unitaire de l\'image jointe', 'x-refersTo': 'http://schema.org/image' })
    } else {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: 'URL de téléchargement unitaire du fichier joint' })
    }
  }
  if (geoUtils.schemaHasGeopoint(dataset.schema) || geoUtils.schemaHasGeometry(dataset.schema)) {
    const geomProp = dataset.schema.find(p => p.key === geoUtils.schemaHasGeometry(dataset.schema))
    if (geomProp) {
      const geoShape = { 'x-calculated': true, key: '_geoshape', type: 'object', title: 'Géométrie', description: 'Au format d\'une géométrie GeoJSON' }
      if (geomProp['x-capabilities']) geoShape['x-capabilities'] = geomProp['x-capabilities']
      schema.push(geoShape)
    }
    if (geomProp && (!geomProp['x-capabilities'] || geomProp['x-capabilities'].geoCorners !== false)) {
      schema.push({ 'x-calculated': true, key: '_geocorners', type: 'array', title: 'Boite englobante de la géométrie', description: 'Sous forme d\'un tableau de coordonnées au format "lat,lon"' })
    }
    const geopoint = { 'x-calculated': true, key: '_geopoint', type: 'string', title: 'Coordonnée géographique', description: 'Centroïde au format "lat,lon"' }
    if (!schema.find(p => p['x-refersTo'] === latlonUri)) geopoint['x-refersTo'] = latlonUri
    schema.push(geopoint)
  }
  if (dataset.isRest) {
    schema.push({
      'x-calculated': true,
      key: '_updatedAt',
      type: 'string',
      format: 'date-time',
      title: 'Date de mise à jour',
      description: 'Date de dernière mise à jour de la ligne du jeu de données'
    })
    if (dataset.rest.storeUpdatedBy) {
      schema.push({
        'x-calculated': true,
        key: '_updatedBy',
        type: 'string',
        title: 'Utilisateur de mise à jour',
        'x-capabilities': { insensitive: false, text: false, textStandard: false }
      })
      schema.push({
        'x-calculated': true,
        key: '_updatedByName',
        type: 'string',
        title: 'Nom de l\'utilisateur de mise à jour',
        'x-capabilities': { text: false }
      })
    }
  }
  if (dataset.isRest && dataset.rest?.lineOwnership) {
    if (!schema.find(p => p.key === '_owner')) {
      schema.push({
        key: '_owner',
        type: 'string',
        title: 'Propriétaire de la ligne',
        'x-capabilities': { insensitive: false, text: false, textStandard: false }
      })
    }
    if (!schema.find(p => p.key === '_ownerName')) {
      schema.push({
        key: '_ownerName',
        type: 'string',
        title: 'Nom du propriétaire de la ligne',
        'x-capabilities': { text: false }
      })
    }
  }
  schema.push({ 'x-calculated': true, key: '_id', type: 'string', format: 'uri-reference', title: 'Identifiant', description: 'Identifiant unique parmi toutes les lignes du jeu de données' })
  schema.push({ 'x-calculated': true, key: '_i', type: 'integer', title: 'Numéro de ligne', description: 'Indice de la ligne dans le fichier d\'origine' })
  schema.push({ 'x-calculated': true, key: '_rand', type: 'integer', title: 'Nombre aléatoire', description: 'Un nombre aléatoire associé à la ligne qui permet d\'obtenir un tri aléatoire par exemple' })

  // maintain coherent x-refersTo and x-concept annotations
  if (fixConcept) {
    let ownerVocabulary
    const standardVocabulary = i18nUtils.vocabularyArray.fr // TODO: how to internalize this ? have a metadata locale info on the dataset ?
    for (const field of schema) {
      if (field['x-refersTo']) {
        let concept = standardVocabulary.find(c => c.identifiers.includes(field['x-refersTo']))
        if (!concept) {
          ownerVocabulary = ownerVocabulary || await settingsUtils.getPrivateOwnerVocabulary(db, dataset.owner)
          concept = ownerVocabulary.find(c => c.identifiers.includes(field['x-refersTo']))
        }
        if (concept) {
          field['x-concept'] = { id: concept.id, title: concept.title, primary: true }
        }
      } else {
        delete field['x-concept']
      }
    }
  }
  return schema
}

exports.tableSchema = (schema) => {
  return {
    fields: schema.filter(f => !f['x-calculated'])
      .filter(f => !f['x-extension'])
      .map(f => {
        const field = { name: f.key, title: f.title || f['x-originalName'], type: f.type }
        if (f.description) field.description = f.description
        // if (f.format) field.format = f.format // commented besause uri-reference format is not in tableschema
        if (f['x-refersTo']) field.rdfType = f['x-refersTo']
        return field
      })
  }
}

const cleanJsonSchemaProperty = (p, publicBaseUrl, writableId) => {
  const cleanProp = { ...p }
  // we badly named enum from the start, too bad, now we accept this semantic difference with json schema
  if (cleanProp.enum) {
    cleanProp.examples = cleanProp.enum
    delete cleanProp.enum
  }
  const labels = cleanProp['x-labels']
  if (labels && Object.keys(labels).length) {
    const values = Object.keys(labels).map(key => ({ title: labels[key] || key, const: key }))
    if (cleanProp['x-labelsRestricted']) {
      cleanProp.oneOf = values
    } else {
      cleanProp.anyOf = values
      cleanProp.anyOf.push({})
    }

    delete cleanProp.examples
  }
  if (cleanProp['x-fromUrl'] && publicBaseUrl) {
    cleanProp['x-fromUrl'] = cleanProp['x-fromUrl'].replace(config.publicUrl, publicBaseUrl)
  }
  if (cleanProp.separator) cleanProp['x-separator'] = cleanProp.separator

  if (cleanProp['x-calculated']) cleanProp.readOnly = true
  if (cleanProp['x-extension']) cleanProp.readOnly = true

  if (p['x-refersTo'] === 'https://schema.org/description') cleanProp['x-display'] = 'markdown'
  if (p['x-refersTo'] === 'https://schema.org/color') cleanProp['x-display'] = 'color-picker'

  delete cleanProp.separator
  delete cleanProp.key
  delete cleanProp.ignoreDetection
  delete cleanProp.ignoreIntegerDetection
  delete cleanProp.icon
  delete cleanProp.label
  return cleanProp
}

/**
 *
 * @param {any} schema
 * @param {string} publicBaseUrl
 * @returns {any}
 */
exports.jsonSchema = (schema, publicBaseUrl) => {
  /** @type {any} */
  const properties = {}
  for (const p of schema) {
    properties[p.key] = cleanJsonSchemaProperty(p, publicBaseUrl)
  }
  return {
    type: 'object',
    required: schema.filter(p => p['x-required']).map(p => p.key),
    properties
  }
}

exports.schemasFullyCompatible = (schema1, schema2, ignoreCalculated = false) => {
  // a change in these properties does not consitute a breaking change of the api
  // and does not require a re-finalization of the dataset when patched
  const innocuous = {
    title: '',
    description: '',
    icon: '',
    'x-display': '',
    'x-master': '',
    'x-labelsRestricted': '',
    'x-labels': '',
    'x-group': '',
    'x-cardinality': '',
    'x-required': '',
    minimum: '',
    maximum: '',
    minLength: '',
    maxLength: '',
    pattern: '',
    readOnly: '',
    enum: ''
  }
  const schema1Bare = schema1.filter(p => !(p['x-calculated'] && ignoreCalculated)).map(p => ({ ...p, ...innocuous })).sort((p1, p2) => p1.key.localeCompare(p2.key))
  const schema2Bare = schema2.filter(p => !(p['x-calculated'] && ignoreCalculated)).map(p => ({ ...p, ...innocuous })).sort((p1, p2) => p1.key.localeCompare(p2.key))
  return equal(schema1Bare, schema2Bare)
}

exports.getSchemaBreakingChanges = (schema, patchedSchema, ignoreExtensions = false) => {
  const breakingChanges = []
  // WARNING, this functionality is kind of a duplicate of the UI in dataset-schema.vue
  for (const field of schema) {
    if (field['x-calculated']) continue
    if (field['x-extension'] && ignoreExtensions) continue
    const patchedField = patchedSchema.find(pf => pf.key === field.key)
    if (!patchedField) {
      breakingChanges.push({ type: 'missing', key: field.key })
      continue
    }
    if (patchedField.type !== field.type) {
      breakingChanges.push({ type: 'type', key: field.key })
      continue
    }
    const format = (field.format && field.format !== 'uri-reference') ? field.format : null
    const patchedFormat = (patchedField.format && patchedField.format !== 'uri-reference') ? patchedField.format : null
    if (patchedFormat !== format) {
      breakingChanges.push({ type: 'type', key: field.key })
      continue
    }
  }
  return breakingChanges
}
