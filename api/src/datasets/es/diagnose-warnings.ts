// Pure functions only. No es client / mongo / node-config imports here.
// Inputs: a dataset object, the esInfos snapshot returned by manage-indices.datasetInfos(),
// and the relevant elasticsearch config subtree. Outputs: a Warning[].

export type WarningSeverity = 'info' | 'warning' | 'error'

export type WarningCode =
  | 'MissingIndex'
  | 'IndexHealthRed'
  | 'MissingIndexSettings'
  | 'ShardingRecommended'
  | 'MissingSearchOnWide'
  | 'MappingNearLimit'
  | 'ReplicaDrift'
  | 'HighSegmentCount'
  | 'LargeDeletedDocsRatio'
  | 'ShardSizeOutOfBand'
  | 'OrphanIndices'

export interface Warning {
  code: WarningCode
  severity: WarningSeverity
  message: string
  details?: Record<string, unknown>
}

export interface DiagnoseThresholds {
  segmentsPerShardWarn: number
  deletedRatioWarn: number
  mappingFieldsLimitWarn: number
  minShardSize: number
}

export interface DiagnoseConfig {
  nbReplicas: number
  maxShardSize: number
  diagnose: DiagnoseThresholds
}

// Highest-priority code first. Used by pickPrimaryCode and also drives the order
// in which the rich list of warnings is returned to the caller.
export const WARNING_PRIORITY: readonly WarningCode[] = [
  'MissingIndex',
  'IndexHealthRed',
  'MissingIndexSettings',
  'ShardingRecommended',
  'MissingSearchOnWide',
  'MappingNearLimit',
  'ReplicaDrift',
  'HighSegmentCount',
  'LargeDeletedDocsRatio',
  'ShardSizeOutOfBand',
  'OrphanIndices'
] as const

const skipDataset = (dataset: any): boolean => {
  if (!dataset) return true
  if (dataset.isVirtual || dataset.isMetaOnly) return true
  return false
}

const sortByPriority = (warnings: Warning[]): Warning[] => {
  return [...warnings].sort((a, b) =>
    WARNING_PRIORITY.indexOf(a.code) - WARNING_PRIORITY.indexOf(b.code)
  )
}

export const computeFinalizeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  // individual checks plug in here in later tasks
  const warnings: Warning[] = []
  return sortByPriority(warnings)
}

export const computeRealtimeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  const warnings: Warning[] = []
  return sortByPriority(warnings)
}

export const pickPrimaryCode = (warnings: Warning[]): WarningCode | null => {
  if (warnings.length === 0) return null
  return sortByPriority(warnings)[0].code
}
