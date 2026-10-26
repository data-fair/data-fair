import mongo from '#mongo'
import { completenessCriteria, computeCompleteness } from '#types/metadata-completeness.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'
import { searchIndexPatch } from './search-text.ts'

/** The stored completeness score and its criteria, null removes them: the owner settings decide whether there is one. */
const completenessPatch = async (dataset: Record<string, any> & { owner: { type: string, id: string } }) => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(dataset.owner), { projection: { datasetsMetadata: 1 } })
  const datasetsMetadata = settings && isMainSettings(settings) ? settings.datasetsMetadata : undefined
  const completeness = computeCompleteness(dataset, datasetsMetadata)
  if (completeness === undefined) return { completeness: null, completenessCriteria: null }
  return { completeness, completenessCriteria: completenessCriteria(dataset, datasetsMetadata) }
}

/** Search index and completeness score, always together: the index patch clears `_needsSearchIndex`, which also stands for a pending rescore. */
export const indexAndCompletenessPatch = async (dataset: Parameters<typeof completenessPatch>[0] & Parameters<typeof searchIndexPatch>[0]) =>
  ({ ...searchIndexPatch(dataset), ...await completenessPatch(dataset) })
