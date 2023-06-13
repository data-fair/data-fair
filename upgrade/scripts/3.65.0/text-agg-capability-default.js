exports.description = 'the textAgg capability now has a default value of false'

// cf relevantCapabilities in the component dataset-property-capabilities.vue
const getRelevantCapabilities = (property) => {
  const type = property.ignoreDetection ? 'string' : property.type
  if (type === 'number' || type === 'integer') {
    return ['index', 'textStandard', 'values']
  } else if (type === 'boolean') {
    return ['index', 'textStandard', 'values']
  } else if (type === 'string' && (property.format === 'date' || property.format === 'date-time')) {
    return ['index', 'textStandard', 'values']
  } else if (property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    return ['geoShape']
  } else if (property['x-refersTo'] === 'http://schema.org/DigitalDocument') {
    return ['indexAttachment']
  } else if (type === 'string') {
    return ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive', 'wildcard']
  }
}

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({}).project({ schema: 1, id: 1 })) {
    if (!dataset.schema) continue
    let hasChange = false
    for (const property of dataset.schema) {
      if (property['x-calculated']) continue
      const relevantCapabilities = getRelevantCapabilities(property)
      if (!relevantCapabilities) continue
      if (!relevantCapabilities.includes('textAgg')) continue
      if (!property['x-capabilities'] || !('textAgg' in property['x-capabilities'])) {
        property['x-capabilities'] = property['x-capabilities'] || {}
        property['x-capabilities'].textAgg = true
        hasChange = true
      }
      if (property['x-capabilities'] && property['x-capabilities'].textAgg === false) {
        delete property['x-capabilities'].textAgg
        if (Object.keys(property['x-capabilities']).length === 0) {
          delete property['x-capabilities']
        }
        hasChange = true
      }
    }
    if (hasChange) {
      debug(`work on dataset ${dataset.id}`)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { schema: dataset.schema } })
    }
  }
}
