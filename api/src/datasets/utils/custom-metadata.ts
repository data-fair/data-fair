import equal from 'fast-deep-equal'
import memoize from 'memoizee'
import mongo from '#mongo'
import { customMetadataSchema, withCurrentLabels, trimCustomMetadata, type CustomMetadataDefinition } from '#types/custom-metadata.ts'
import { compile } from '../../misc/utils/ajv.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

export const getCustomMetadataDefinitions = async (owner: { type: string, id: string }): Promise<CustomMetadataDefinition[]> => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { datasetsMetadata: 1 } })
  return (settings && isMainSettings(settings) ? settings.datasetsMetadata?.custom : undefined) ?? []
}

// memoized: ajv.compile is codegen and the definitions rarely change
export const compileCustomMetadata = memoize((definitionsJson: string, throws: boolean = true) => compile(customMetadataSchema(JSON.parse(definitionsJson)), throws), {
  profileName: 'compileCustomMetadata',
  primitive: true,
  length: 2,
  max: 1000,
  maxAge: 1000 * 60
})

// only the values this write changes are checked, so a definition change never blocks the other fields
export const prepareCustomMetadata = async (owner: { type: string, id: string }, customMetadata: Record<string, unknown>, previous?: Record<string, unknown>) => {
  trimCustomMetadata(customMetadata)
  const definitions = await getCustomMetadataDefinitions(owner)
  const changed = Object.fromEntries(Object.entries(customMetadata).filter(([key, value]) => !equal(value, previous?.[key])))
  compileCustomMetadata(JSON.stringify(definitions))(changed)
  for (const definition of definitions) {
    if (definition.key && definition.key in changed) customMetadata[definition.key] = withCurrentLabels(definition, customMetadata[definition.key])
  }
}
