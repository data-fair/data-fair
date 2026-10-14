import equal from 'fast-deep-equal'
import memoize from 'memoizee'
import mongo from '#mongo'
import { customMetadataSchema, trimCustomMetadata, type CustomMetadataDefinition } from '#types/custom-metadata.ts'
import { ajv } from '@data-fair/data-fair-shared/ajv.js'
import { compile } from '../../misc/utils/ajv.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

export const getCustomMetadataDefinitions = async (owner: { type: string, id: string }): Promise<CustomMetadataDefinition[]> => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { datasetsMetadata: 1 } })
  return (settings && isMainSettings(settings) ? settings.datasetsMetadata?.custom : undefined) ?? []
}

// ajv caches every compiled schema by object, so an evicted validator must leave that cache too
export const compileCustomMetadata = memoize((definitionsJson: string, throws: boolean = true) => {
  const schema = customMetadataSchema(JSON.parse(definitionsJson))
  return Object.assign(compile(schema, throws), { schema })
}, {
  profileName: 'compileCustomMetadata',
  primitive: true,
  length: 2,
  max: 1000,
  dispose: (validate: { schema: object }) => { ajv.removeSchema(validate.schema) }
})

// only the values this write changes are checked, so a definition change never blocks the other fields
export const prepareCustomMetadata = async (owner: { type: string, id: string }, customMetadata: Record<string, unknown>, previous?: Record<string, unknown>) => {
  trimCustomMetadata(customMetadata)
  const definitions = await getCustomMetadataDefinitions(owner)
  const changed = Object.fromEntries(Object.entries(customMetadata).filter(([key, value]) => !equal(value, previous?.[key])))
  compileCustomMetadata(JSON.stringify(definitions))(changed)
}
