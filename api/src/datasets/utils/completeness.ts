import mongo from '#mongo'
import { computeCompleteness } from '#types/metadata-completeness.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

/** The stored completeness score, null removes it: the owner settings decide whether there is one. */
export const completenessPatch = async (dataset: Record<string, any> & { owner: { type: string, id: string } }) => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(dataset.owner), { projection: { datasetsMetadata: 1 } })
  const datasetsMetadata = settings && isMainSettings(settings) ? settings.datasetsMetadata : undefined
  return { completeness: computeCompleteness(dataset, datasetsMetadata) ?? null }
}
