import mongo from '#mongo'
import { computeSearchText, type CatalogSearchSettings } from '../operations.ts'

// the owner's main settings (department settings never carry catalogSearch)
export const getCatalogSearchSettings = async (owner: { type: string, id: string }): Promise<CatalogSearchSettings | undefined> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { catalogSearch: 1 } }
  )
  return (settings as { catalogSearch?: CatalogSearchSettings } | null)?.catalogSearch
}

/** The `_searchText` value to write for a dataset, `null` to unset it. */
export const searchTextPatch = async (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }): Promise<{ _searchText: string | null }> => {
  const catalogSearch = await getCatalogSearchSettings(dataset.owner)
  return { _searchText: computeSearchText(dataset, catalogSearch) ?? null }
}
