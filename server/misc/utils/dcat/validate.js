const Ajv = require('ajv-draft-04')
const addFormats = require('ajv-formats')

const ajv = new Ajv({ unicodeRegExp: false })
addFormats(ajv)

ajv.addSchema(require('./schema/catalog.json'))
ajv.addSchema(require('./schema/dataset.json'))
ajv.addSchema(require('./schema/distribution.json'))
ajv.addSchema(require('./schema/organization.json'))
ajv.addSchema(require('./schema/vcard.json'))

module.exports = ajv.getSchema('https://project-open-data.cio.gov/v1.1/schema/catalog.json#')
