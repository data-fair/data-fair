// Pure functions only. No es client / mongo / node-config imports here.
// Inputs: a dataset object, the esInfos snapshot returned by manage-indices.datasetInfos(),
// and the relevant elasticsearch config subtree. Outputs: a Warning[].

import { hasManyQSearchFields } from './operations.ts'

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

const getRecommendedNbShards = (dataset: any, maxShardSize: number): number => {
  return Math.max(1, Math.ceil((dataset.storage?.indexed?.size || 0) / maxShardSize))
}

const finalizeChecks = (dataset: any, esInfos: any, config: DiagnoseConfig): Warning[] => {
  const warnings: Warning[] = []

  if (!esInfos.index) {
    warnings.push({
      code: 'MissingIndex',
      severity: 'error',
      message: 'no Elasticsearch index found for this dataset'
    })
    return warnings
  }

  if (esInfos.index.health === 'red') {
    warnings.push({
      code: 'IndexHealthRed',
      severity: 'error',
      message: 'index health is red'
    })
  }

  const indexSettings = esInfos.index.definition?.settings?.index
  if (!indexSettings?.number_of_shards) {
    warnings.push({
      code: 'MissingIndexSettings',
      severity: 'error',
      message: 'index settings (number_of_shards) are missing'
    })
    return warnings
  }

  const currentNbShards = Number(indexSettings.number_of_shards)
  const recommendedNbShards = getRecommendedNbShards(dataset, config.maxShardSize)
  if (currentNbShards !== recommendedNbShards) {
    warnings.push({
      code: 'ShardingRecommended',
      severity: 'warning',
      message: `current shard count ${currentNbShards} differs from recommended ${recommendedNbShards}`,
      details: { currentNbShards, recommendedNbShards }
    })
  }

  const properties = esInfos.index.definition?.mappings?.properties ?? {}
  if (hasManyQSearchFields(dataset.schema) && !properties._search) {
    warnings.push({
      code: 'MissingSearchOnWide',
      severity: 'warning',
      message: 'wide dataset is missing the _search catch-all field; reindex to apply the optimization'
    })
  }

  const limit = Number(indexSettings['mapping.total_fields.limit'] ?? 1000)
  const fields = Object.keys(properties).length
  if (fields / limit > config.diagnose.mappingFieldsLimitWarn) {
    warnings.push({
      code: 'MappingNearLimit',
      severity: 'warning',
      message: `${fields} mapped fields exceeds ${Math.round(config.diagnose.mappingFieldsLimitWarn * 100)}% of the limit (${limit})`,
      details: { fields, limit }
    })
  }

  return warnings
}

export const computeFinalizeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  return sortByPriority(finalizeChecks(dataset, esInfos, config))
}

export const computeRealtimeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  const warnings = finalizeChecks(dataset, esInfos, config)
  // realtime-only checks plug in here in later tasks
  return sortByPriority(warnings)
}

export const pickPrimaryCode = (warnings: Warning[]): WarningCode | null => {
  if (warnings.length === 0) return null
  return sortByPriority(warnings)[0].code
}
