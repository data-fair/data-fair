module.exports = (values) => {
  // schemaField.type = infos.type
  // if (infos.enum) schemaField.enum = infos.enum
  // if (infos['x-refersTo']) schemaField['x-refersTo'] = infos['x-refersTo']
  // if (infos.format) schemaField.format = infos.format
  return {
    type: 'string'
  }
}
