import equal from 'fast-deep-equal'
import { settingsSchema } from '#api/types'

type DatasetsMetadata = Record<string, any> & {
  groups?: { key: string, title: string, icon?: { svgPath?: string } }[]
  custom?: { key: string, group?: string }[]
} | null | undefined

const fixedMetadata = settingsSchema.properties.datasetsMetadata.properties as Record<string, any>

// a removed category sends its metadata back to their default tab
const isGroup = (datasetsMetadata: DatasetsMetadata, group?: string): group is string =>
  !!group && (group === 'informations' || group === 'coverage' || !!datasetsMetadata?.groups?.some(g => g.key === group))

export const fieldGroup = (datasetsMetadata: DatasetsMetadata, field: string): string => {
  const group = datasetsMetadata?.[field]?.group
  if (isGroup(datasetsMetadata, group)) return group
  return fixedMetadata[field]?.properties?.group?.['x-default'] ?? 'informations'
}

export const customGroup = (datasetsMetadata: DatasetsMetadata, key: string): string => {
  const group = datasetsMetadata?.custom?.find(c => c.key === key)?.group
  return isGroup(datasetsMetadata, group) ? group : 'informations'
}

// the tabs holding at least one active metadata, informations always holds the title
// hidden: the metadata the form does not show on this dataset (topics without any topic defined...)
export const usedGroups = (datasetsMetadata: DatasetsMetadata, hidden: string[] = []) => new Set([
  'informations',
  ...Object.entries(fixedMetadata)
    .filter(([key, prop]) => prop.properties?.group && !hidden.includes(key) && (datasetsMetadata?.[key]?.active ?? prop.properties.active.default))
    .map(([key]) => fieldGroup(datasetsMetadata, key)),
  ...(datasetsMetadata?.custom ?? []).map(c => customGroup(datasetsMetadata, c.key))
])

const tabFields = ['title', 'summary', 'description', ...Object.keys(fixedMetadata).filter(key => fixedMetadata[key].properties?.group)]

// the tabs holding a field changed between the edited dataset and the saved one
export const modifiedGroups = (datasetsMetadata: DatasetsMetadata, data: any, serverData: any) => {
  const groups = new Set<string>()
  for (const field of tabFields) {
    if (!equal(data?.[field], serverData?.[field])) groups.add(fieldGroup(datasetsMetadata, field))
  }
  for (const key of new Set([...Object.keys(data?.customMetadata ?? {}), ...Object.keys(serverData?.customMetadata ?? {})])) {
    if (!equal(data?.customMetadata?.[key], serverData?.customMetadata?.[key])) groups.add(customGroup(datasetsMetadata, key))
  }
  return groups
}
