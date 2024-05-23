exports.cleanJsonSchemaProperty = (p, defaultPublicUrl, publicBaseUrl) => {
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
    cleanProp['x-fromUrl'] = cleanProp['x-fromUrl'].replace(defaultPublicUrl, publicBaseUrl)
  }
  if (cleanProp.separator) cleanProp['x-separator'] = cleanProp.separator

  if (cleanProp['x-calculated']) cleanProp.readOnly = true
  if (cleanProp['x-extension']) cleanProp.readOnly = true

  if (p['x-refersTo'] === 'http://schema.org/description') cleanProp['x-display'] = 'markdown'
  if (p['x-refersTo'] === 'https://schema.org/color') cleanProp['x-display'] = 'color-picker'

  delete cleanProp.separator
  delete cleanProp.key
  delete cleanProp.ignoreDetection
  delete cleanProp.ignoreIntegerDetection
  delete cleanProp.icon
  delete cleanProp.label
  return cleanProp
}
