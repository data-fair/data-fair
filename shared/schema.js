export const cleanJsonSchemaProperty = (p, defaultPublicUrl, publicBaseUrl, flatArrays = false) => {
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

  if (cleanProp.pattern && cleanProp.patternErrorMessage) {
    // cf https://ajv.js.org/packages/ajv-errors.html
    cleanProp.errorMessage = cleanProp.errorMessage ?? {}
    cleanProp.errorMessage.pattern = cleanProp.patternErrorMessage
  }

  delete cleanProp.separator
  delete cleanProp.key
  delete cleanProp.ignoreDetection
  delete cleanProp.ignoreIntegerDetection
  delete cleanProp.icon
  delete cleanProp.label
  delete cleanProp['x-required']

  if (cleanProp['x-separator']) {
    if (flatArrays) {
      if (cleanProp['x-display'] || cleanProp.format) {
        // separator is incompatible with custom input components, we chose to render the proper component
        // but with a single value, instead of multi-value in a basic text field
        delete cleanProp['x-separator']
        return cleanProp
      }
      // flat usage of separator is incompatible with validation
      return {
        type: 'string',
        title: cleanProp.title,
        description: cleanProp.description,
        readOnly: cleanProp.readOnly,
        'x-separator': cleanProp['x-separator'],
        'x-fromUrl': cleanProp['x-fromUrl']
      }
    } else {
      const itemsProps = { ...cleanProp }
      delete itemsProps.title
      delete itemsProps.description
      delete itemsProps.readOnly
      delete itemsProps['x-separator']
      delete itemsProps['x-fromUrl']

      return {
        type: 'array',
        title: cleanProp.title,
        description: cleanProp.description,
        readOnly: cleanProp.readOnly,
        'x-fromUrl': cleanProp['x-fromUrl'],
        items: itemsProps
      }
    }
  }

  return cleanProp
}
