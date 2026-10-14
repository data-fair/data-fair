import equal from 'fast-deep-equal'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import { fitsCustomMetadata, isList, trimCustomMetadata, typeOf, type CustomMetadataDefinition } from '#types/custom-metadata.ts'
import { rootSettingsFilter, isMainSettings } from '../../settings/operations.ts'

const expected = { string: 'texte attendu', integer: 'nombre entier attendu', number: 'nombre attendu', date: 'date attendue (AAAA-MM-JJ)', link: 'adresse web attendue (http:// ou https://)' }

const getCustomMetadataDefinitions = async (owner: { type: string, id: string }): Promise<CustomMetadataDefinition[]> => {
  const settings = await mongo.settings.findOne(rootSettingsFilter(owner), { projection: { datasetsMetadata: 1 } })
  return (settings && isMainSettings(settings) ? settings.datasetsMetadata?.custom : undefined) ?? []
}

// only the values this write changes are checked, so a definition change never blocks the other fields
export const prepareCustomMetadata = async (owner: { type: string, id: string }, customMetadata: Record<string, unknown>, previous?: Record<string, unknown>) => {
  trimCustomMetadata(customMetadata)
  const definitions = await getCustomMetadataDefinitions(owner)
  for (const [key, value] of Object.entries(customMetadata)) {
    if (equal(value, previous?.[key])) continue
    const definition = definitions.find(d => d.key === key)
    if (!definition) throw httpError(400, `métadonnée personnalisée inconnue : ${key}`)
    if (!fitsCustomMetadata(definition, value)) throw httpError(400, `${definition.title} : ${isList(definition) ? 'valeur absente de la liste' : expected[typeOf(definition)]}`)
  }
}
