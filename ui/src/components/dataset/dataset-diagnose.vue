<template>
  <div class="px-4 pt-4">
    <div class="d-flex align-center mb-4">
      <div class="text-body-medium text-medium-emphasis">
        {{ t('subtitle') }}
      </div>
      <v-spacer />
      <v-btn
        :prepend-icon="mdiRefresh"
        :loading="diagnoseFetch.loading.value"
        size="small"
        variant="text"
        @click="diagnoseFetch.refresh()"
      >
        {{ t('refresh') }}
      </v-btn>
    </div>

    <!-- Warnings list -->
    <div v-if="data">
      <v-alert
        v-if="!data.warnings || data.warnings.length === 0"
        type="success"
        variant="tonal"
        class="mb-4"
        :text="t('noIssues')"
      />
      <v-alert
        v-for="w in data.warnings"
        :key="w.code"
        :type="alertType(w.severity)"
        variant="tonal"
        class="mb-3"
      >
        <div class="text-body-1 font-weight-bold">
          {{ t('warning.' + w.code) }}
        </div>
        <div class="text-body-medium">
          {{ w.message }}
        </div>
        <dl
          v-if="w.details"
          class="mt-2 text-caption"
        >
          <template
            v-for="(v, k) in w.details"
            :key="k"
          >
            <dt class="d-inline font-weight-medium">
              {{ k }}:
            </dt>
            <dd class="d-inline ml-1 mr-3">
              {{ formatDetail(k, v) }}
            </dd>
          </template>
        </dl>
      </v-alert>

      <!-- Summary -->
      <v-card
        v-if="data.esInfos?.index"
        variant="flat"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1">
          {{ t('summary') }}
        </v-card-title>
        <v-card-text>
          <v-row
            dense
            class="text-body-medium"
          >
            <v-col
              v-for="row in summaryRows"
              :key="row.key"
              cols="6"
              md="4"
            >
              <span class="text-medium-emphasis">{{ row.label }}:</span>
              <span class="ml-1">{{ row.value }}</span>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Locks -->
      <v-card
        variant="flat"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1">
          {{ t('locks') }}
        </v-card-title>
        <v-card-text>
          <div
            v-if="!data.locks || data.locks.every((l: any) => !l)"
            class="text-medium-emphasis"
          >
            {{ t('locksFree') }}
          </div>
          <ul v-else>
            <li
              v-for="(l, i) in data.locks"
              :key="i"
            >
              <code v-if="l">{{ l._id }} — pid {{ l.pid }}, expires {{ l.expiresAt }}</code>
              <code
                v-else
                class="text-medium-emphasis"
              >free</code>
            </li>
          </ul>
        </v-card-text>
      </v-card>

      <!-- Raw JSON -->
      <v-expansion-panels variant="accordion">
        <v-expansion-panel :title="t('rawJson') + ' — esInfos'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.esInfos, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
        <v-expansion-panel :title="t('rawJson') + ' — filesInfos'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.filesInfos, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
        <v-expansion-panel :title="t('rawJson') + ' — locks'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.locks, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <v-progress-circular
      v-else-if="diagnoseFetch.loading.value"
      indeterminate
      color="admin"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  subtitle: Informations techniques pour les administrateurs. Cliquez sur Rafraîchir pour recharger.
  refresh: Rafraîchir
  noIssues: Aucun problème détecté
  summary: Résumé
  locks: Verrous
  locksFree: Aucun verrou actif
  rawJson: JSON brut
  warning:
    MissingIndex: Index Elasticsearch manquant
    IndexHealthRed: Index en statut rouge
    MissingIndexSettings: Paramètres d'index manquants
    ShardingRecommended: Sharding à ajuster
    MissingSearchOnWide: Champ _search manquant (dataset large)
    MappingNearLimit: Nombre de champs proche de la limite
    ReplicaDrift: Nombre de réplicas non aligné avec la configuration
    HighSegmentCount: Trop de segments par shard
    LargeDeletedDocsRatio: Ratio élevé de documents supprimés
    ShardSizeOutOfBand: Taille de shard hors plage
    OrphanIndices: Index orphelins pour ce dataset
en:
  subtitle: Technical information for superadmins. Use Refresh to reload.
  refresh: Refresh
  noIssues: No issues detected
  summary: Summary
  locks: Locks
  locksFree: No active locks
  rawJson: Raw JSON
  warning:
    MissingIndex: Elasticsearch index missing
    IndexHealthRed: Index health is red
    MissingIndexSettings: Index settings missing
    ShardingRecommended: Sharding recommended
    MissingSearchOnWide: Missing _search field on wide dataset
    MappingNearLimit: Mapped fields near the limit
    ReplicaDrift: Replica count diverges from config
    HighSegmentCount: High segment count per shard
    LargeDeletedDocsRatio: Large deleted-docs ratio
    ShardSizeOutOfBand: Shard size out of band
    OrphanIndices: Orphan indices for this dataset
</i18n>

<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'
import useDatasetStore from '~/composables/dataset/dataset-store'

const { t } = useI18n()
const { id } = useDatasetStore()

type DiagnoseResponse = {
  filesInfos: any[]
  esInfos: any
  locks: any[]
  warnings: { code: string, severity: 'info' | 'warning' | 'error', message: string, details?: Record<string, unknown> }[]
}

const diagnoseFetch = useFetch<DiagnoseResponse>(`${$apiPath}/datasets/${id}/_diagnose`)
const data = computed(() => diagnoseFetch.data.value)

const alertType = (severity: string) => {
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

const summaryRows = computed(() => {
  const idx = data.value?.esInfos?.index
  if (!idx) return []
  const settings = idx.definition?.settings?.index ?? {}
  return [
    { key: 'alias', label: 'alias', value: data.value!.esInfos?.aliasName },
    { key: 'index', label: 'index', value: idx.index },
    { key: 'health', label: 'health', value: idx.health },
    { key: 'docs', label: 'docs.count', value: idx['docs.count'] },
    { key: 'deleted', label: 'docs.deleted', value: idx['docs.deleted'] },
    { key: 'storeSize', label: 'pri.store.size', value: formatBytes(Number(idx['pri.store.size']) || 0) },
    { key: 'shards', label: 'number_of_shards', value: settings.number_of_shards },
    { key: 'replicas', label: 'number_of_replicas', value: settings.number_of_replicas },
    { key: 'segments', label: 'segments.count', value: idx['segments.count'] }
  ]
})

const formatDetail = (key: string | number, value: unknown): string => {
  const k = String(key)
  if (typeof value === 'number') {
    if (k.toLowerCase().includes('size')) return formatBytes(value)
    if (k.toLowerCase().includes('ratio')) return (value * 100).toFixed(1) + '%'
    return Math.round(value * 100) / 100 + ''
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
</script>
