exports.description = 'remove some deprecated capabilities'

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
    return ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive']
  }
}

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({}).project({ schema: 1, id: 1 })) {
    debug(`work on dataset ${dataset.id}`)
    if (!dataset.schema) continue
    let hasChange = false
    for (const property of dataset.schema) {
      if (!property['x-capabilities']) continue
      const relevantCapabilities = getRelevantCapabilities(property)
      if (!relevantCapabilities) continue
      for (const capability of Object.keys(property['x-capabilities'])) {
        if (!relevantCapabilities.includes(capability)) {
          debug(`capability "${capability}" not relevant for property "${property.key}" of type ${property.type}/${property.format || property['x-refersTo'] || ''}`)
          delete property['x-capabilities'][capability]
          hasChange = true
        }
      }
    }
    if (hasChange) {
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { schema: dataset.schema } })
    }
  }
}
