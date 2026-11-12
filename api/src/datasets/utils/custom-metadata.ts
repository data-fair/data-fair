import equal from 'fast-deep-equal'
import memoize from 'memoizee'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { i18nHttpError } from '../../misc/utils/i18n-errors.ts'
import { resolveXI18n } from '@data-fair/lib-utils/json-schema.js'
import { ajv } from '@data-fair/data-fair-shared/ajv.js'
import mongo from '#mongo'
import { customMetadataSchema, trimCustomMetadata, type CustomMetadataDefinition } from '#types/custom-metadata.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

const getCustomMetadataDefinitions = async (owner: { type: string, id: string }): Promise<CustomMetadataDefinition[]> => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { datasetsMetadata: 1 } })
  return (settings && isMainSettings(settings) ? settings.datasetsMetadata?.custom : undefined) ?? []
}

// keyed on the definitions themselves, no maxAge: ajv keeps every compiled schema, so an evicted one must leave its cache
export const compileCustomMetadata = memoize((definitions: CustomMetadataDefinition[]) => {
  const schema = customMetadataSchema(definitions)
  // the API error messages are written in French, so are the error messages of the schema
  resolveXI18n(schema, 'fr')
  return Object.assign(ajv.compile(schema), { schema })
}, {
  profileName: 'compileCustomMetadata',
  primitive: true,
  max: 1000,
  dispose: (validate: { schema: object }) => { ajv.removeSchema(validate.schema) },
  normalizer: ([definitions]: [CustomMetadataDefinition[]]) => JSON.stringify(definitions)
})

// only the values this write changes are checked, so a definition change never blocks the other fields
export const prepareCustomMetadata = async (owner: { type: string, id: string }, customMetadata: Record<string, unknown>, previous?: Record<string, unknown>) => {
  trimCustomMetadata(customMetadata)
  const definitions = await getCustomMetadataDefinitions(owner)
  const changed = Object.fromEntries(Object.entries(customMetadata).filter(([key, value]) => !equal(value, previous?.[key])))
  const validate = compileCustomMetadata(definitions)
  if (validate(changed)) return
  const error = validate.errors![0]
  if (error.keyword === 'additionalProperties') throw i18nHttpError(400, 'errors.customMetadata.unknown', { key: String(error.params.additionalProperty) })
  const key = error.instancePath.split('/')[1]
  throw httpError(400, `${definitions.find(d => d.key === key)?.title ?? key} : ${error.message}`)
}
