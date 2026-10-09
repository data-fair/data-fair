import equal from 'fast-deep-equal'
import memoize from 'memoizee'
import mongo from '#mongo'
import { customMetadataSchema, trimCustomMetadata, type CustomMetadataDefinition } from '#types/custom-metadata.ts'
import { compile } from '../../misc/utils/ajv.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

export const getCustomMetadataDefinitions = async (owner: { type: string, id: string }): Promise<CustomMetadataDefinition[]> => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { datasetsMetadata: 1 } })
  return (settings && isMainSettings(settings) ? settings.datasetsMetadata?.custom : undefined) ?? []
}

// memoized without maxAge: keyed on the definitions themselves, and each recompile would stay in ajv's own cache
export const compileCustomMetadata = memoize((definitionsJson: string, throws: boolean = true) => compile(customMetadataSchema(JSON.parse(definitionsJson)), throws), {
  profileName: 'compileCustomMetadata',
  primitive: true,
  length: 2,
  max: 1000
})

// only the values this write changes are checked, so a definition change never blocks the other fields
export const prepareCustomMetadata = async (owner: { type: string, id: string }, customMetadata: Record<string, unknown>, previous?: Record<string, unknown>) => {
  trimCustomMetadata(customMetadata)
  const definitions = await getCustomMetadataDefinitions(owner)
  const changed = Object.fromEntries(Object.entries(customMetadata).filter(([key, value]) => !equal(value, previous?.[key])))
  compileCustomMetadata(JSON.stringify(definitions))(changed)
}
