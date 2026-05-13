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

  const currentReplicas = Number(indexSettings.number_of_replicas)
  if (!Number.isNaN(currentReplicas) && currentReplicas !== config.nbReplicas) {
    warnings.push({
      code: 'ReplicaDrift',
      severity: 'info',
      message: `index has ${currentReplicas} replicas but config expects ${config.nbReplicas}`,
      details: { current: currentReplicas, expected: config.nbReplicas }
    })
  }

  return warnings
}

const realtimeChecks = (dataset: any, esInfos: any, config: DiagnoseConfig): Warning[] => {
  const warnings: Warning[] = []
  if (!esInfos.index) return warnings
  const indexSettings = esInfos.index.definition?.settings?.index
  if (!indexSettings?.number_of_shards) return warnings
  const nbShards = Number(indexSettings.number_of_shards)

  const segments = Number(esInfos.index['segments.count'])
  if (!Number.isNaN(segments) && nbShards > 0) {
    const segmentsPerShard = segments / nbShards
    if (segmentsPerShard > config.diagnose.segmentsPerShardWarn) {
      warnings.push({
        code: 'HighSegmentCount',
        severity: 'warning',
        message: `${segmentsPerShard.toFixed(1)} segments per shard exceeds threshold ${config.diagnose.segmentsPerShardWarn}; a force_merge may help`,
        details: { segmentsPerShard, segments, nbShards }
      })
    }
  }

  const docsCount = Number(esInfos.index['docs.count'])
  const docsDeleted = Number(esInfos.index['docs.deleted'])
  if (!Number.isNaN(docsCount) && !Number.isNaN(docsDeleted)) {
    const total = docsCount + docsDeleted
    if (total > 1000) {
      const ratio = docsDeleted / total
      if (ratio > config.diagnose.deletedRatioWarn) {
        warnings.push({
          code: 'LargeDeletedDocsRatio',
          severity: 'warning',
          message: `${(ratio * 100).toFixed(1)}% of documents are deleted; consider reindexing to reclaim space`,
          details: { ratio, docsCount, docsDeleted }
        })
      }
    }
  }

  const priBytes = Number(esInfos.index['pri.store.size'])
  if (!Number.isNaN(priBytes) && nbShards > 1) {
    const avgShardSize = priBytes / nbShards
    if (avgShardSize > config.maxShardSize) {
      warnings.push({
        code: 'ShardSizeOutOfBand',
        severity: 'warning',
        message: `average shard size ${avgShardSize.toFixed(0)} bytes exceeds maxShardSize ${config.maxShardSize}`,
        details: { avgShardSize, maxShardSize: config.maxShardSize, nbShards }
      })
    } else if (avgShardSize < config.diagnose.minShardSize) {
      warnings.push({
        code: 'ShardSizeOutOfBand',
        severity: 'warning',
        message: `average shard size ${avgShardSize.toFixed(0)} bytes is below minShardSize ${config.diagnose.minShardSize}`,
        details: { avgShardSize, minShardSize: config.diagnose.minShardSize, nbShards }
      })
    }
  }

  const allIndices: any[] = esInfos.indices ?? []
  if (allIndices.length > 1) {
    const aliasedName = esInfos.index?.index
    const orphans = allIndices.map(i => i.index).filter(name => name !== aliasedName)
    warnings.push({
      code: 'OrphanIndices',
      severity: 'info',
      message: `${orphans.length} orphan index(es) for this dataset; leftover from failed reindex`,
      details: { orphans }
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
  return sortByPriority([
    ...finalizeChecks(dataset, esInfos, config),
    ...realtimeChecks(dataset, esInfos, config)
  ])
}

export const pickPrimaryCode = (warnings: Warning[]): WarningCode | null => {
  if (warnings.length === 0) return null
  return sortByPriority(warnings)[0].code
}
