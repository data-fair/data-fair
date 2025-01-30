import Ajv from 'ajv-draft-04'
import addFormats from 'ajv-formats'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const catalogSchema = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './schema/catalog.json'), 'utf8'))
const datasetSchema = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './schema/dataset.json'), 'utf8'))
const distributionSchema = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './schema/distribution.json'), 'utf8'))
const organizationSchema = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './schema/organization.json'), 'utf8'))
const vcardSchema = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './schema/vcard.json'), 'utf8'))

const ajv = new Ajv({ unicodeRegExp: false })
addFormats(ajv)

ajv.addSchema(catalogSchema)
ajv.addSchema(datasetSchema)
ajv.addSchema(distributionSchema)
ajv.addSchema(organizationSchema)
ajv.addSchema(vcardSchema)

export default ajv.getSchema('https://project-open-data.cio.gov/v1.1/schema/catalog.json#')
