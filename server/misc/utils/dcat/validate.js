
import Ajv from 'ajv-draft-04'
import addFormats from 'ajv-formats'
import catalogSchema from './schema/catalog.json'
import datasetSchema from './schema/dataset.json'
import distributionSchema from './schema/distribution.json'
import organizationSchema from './schema/organization.json'
import vcardSchema from './schema/vcard.json'

const ajv = new Ajv({ unicodeRegExp: false })
addFormats(ajv)

ajv.addSchema(catalogSchema)
ajv.addSchema(datasetSchema)
ajv.addSchema(distributionSchema)
ajv.addSchema(organizationSchema)
ajv.addSchema(vcardSchema)

export default ajv.getSchema('https://project-open-data.cio.gov/v1.1/schema/catalog.json#')
