import equal from 'fast-deep-equal'

type DatasetsMetadata = Record<string, any> & {
  groups?: { key: string, title: string, icon?: { svgPath?: string } }[]
  custom?: { key: string, group?: string }[]
} | null | undefined

// fixed metadata shown in the coverage tab unless the settings move them, all others go to informations
const coverageFields = ['spatial', 'temporal', 'frequency', 'modified', 'topics', 'keywords', 'searchTerms', 'relatedDatasets']

// a removed category sends its metadata back to their default tab
const isGroup = (datasetsMetadata: DatasetsMetadata, group?: string): group is string =>
  !!group && (group === 'informations' || group === 'coverage' || !!datasetsMetadata?.groups?.some(g => g.key === group))

export const fieldGroup = (datasetsMetadata: DatasetsMetadata, field: string): string => {
  const group = datasetsMetadata?.[field]?.group
  if (isGroup(datasetsMetadata, group)) return group
  return coverageFields.includes(field) ? 'coverage' : 'informations'
}

export const customGroup = (datasetsMetadata: DatasetsMetadata, key: string): string => {
  const group = datasetsMetadata?.custom?.find(c => c.key === key)?.group
  return isGroup(datasetsMetadata, group) ? group : 'informations'
}

// the tabs holding a field changed between the edited dataset and the saved one
export const modifiedGroups = (datasetsMetadata: DatasetsMetadata, data: any, serverData: any) => {
  const groups = new Set<string>()
  const keys = (a: any, b: any) => new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const field of keys(data, serverData)) {
    if (field === 'customMetadata') {
      for (const key of keys(data?.customMetadata, serverData?.customMetadata)) {
        if (!equal(data?.customMetadata?.[key], serverData?.customMetadata?.[key])) groups.add(customGroup(datasetsMetadata, key))
      }
    } else if (!equal(data?.[field], serverData?.[field])) {
      groups.add(fieldGroup(datasetsMetadata, field))
    }
  }
  return groups
}
