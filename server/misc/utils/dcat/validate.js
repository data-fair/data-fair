
import Ajv from 'ajv-draft-04'
import addFormats from 'ajv-formats'
import catalogSchema from './schema/catalog.json' with {type: 'json'}
import datasetSchema from './schema/dataset.json' with {type: 'json'}
import distributionSchema from './schema/distribution.json' with {type: 'json'}
import organizationSchema from './schema/organization.json' with {type: 'json'}
import vcardSchema from './schema/vcard.json' with {type: 'json'}

const ajv = new Ajv({ unicodeRegExp: false })
addFormats(ajv)

ajv.addSchema(catalogSchema)
ajv.addSchema(datasetSchema)
ajv.addSchema(distributionSchema)
ajv.addSchema(organizationSchema)
ajv.addSchema(vcardSchema)

export default ajv.getSchema('https://project-open-data.cio.gov/v1.1/schema/catalog.json#')
