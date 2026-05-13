<template>
  <v-container>
    <div class="d-flex align-center mb-4">
      <h2 class="text-title-large">
        {{ t('title') }}
      </h2>
      <v-spacer />
      <span
        v-if="lastFetchedLabel"
        class="text-caption text-medium-emphasis mr-2"
      >{{ lastFetchedLabel }}</span>
      <v-btn
        :prepend-icon="mdiRefresh"
        :loading="diagnoseFetch.loading.value"
        size="small"
        variant="text"
        @click="refresh"
      >
        {{ t('refresh') }}
      </v-btn>
    </div>

    <v-alert
      v-if="data?.errors?.length"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      <div class="text-body-medium font-weight-bold">
        {{ t('partialErrors') }}
      </div>
      <ul>
        <li
          v-for="e in data.errors"
          :key="e.section"
        >
          <code>{{ e.section }}</code>: {{ e.message }}
        </li>
      </ul>
    </v-alert>

    <!-- Cluster header card -->
    <v-card
      v-if="data?.cluster"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('cluster.title') }}
        <v-chip
          :color="statusColor(data.cluster.status)"
          size="small"
          class="ml-2"
        >
          {{ data.cluster.status }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col
            v-for="kpi in clusterKpis"
            :key="kpi.label"
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ kpi.label }}
            </div>
            <div class="text-body-medium">
              {{ kpi.value }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Nodes table -->
    <v-card
      v-if="data?.nodes"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('nodes.title') }}
      </v-card-title>
      <v-data-table
        :headers="nodeHeaders"
        :items="data.nodes"
        item-value="id"
        :items-per-page="-1"
        density="compact"
        show-expand
      >
        <template #item.roles="{ item }">
          <v-chip
            v-for="r in item.roles"
            :key="r"
            size="x-small"
            class="mr-1"
          >
            {{ r }}
          </v-chip>
        </template>
        <template #item.heapUsedPct="{ item }">
          {{ pctOrDash(item.heapUsedPct) }}
        </template>
        <template #item.cpuPct="{ item }">
          {{ pctOrDash(item.cpuPct) }}
        </template>
        <template #item.load1m="{ item }">
          {{ numOrDash(item.load1m) }}
        </template>
        <template #item.shardCount="{ item }">
          {{ shardCellLabel(item) }}
          <v-chip
            v-if="isShardCapNear(item)"
            color="warning"
            size="x-small"
            class="ml-1"
            :title="t('nodes.shardCap')"
          >
            !
          </v-chip>
        </template>
        <template #item.disk="{ item }">
          {{ pctOrDash(item.disk.usedPct) }}
          <v-chip
            v-if="item.disk.watermark && item.disk.watermark !== 'ok'"
            :color="watermarkColor(item.disk.watermark)"
            size="x-small"
            class="ml-1"
          >
            {{ item.disk.watermark }}
          </v-chip>
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <div class="my-2">
                <div
                  v-if="trippedBreakers(item).length"
                  class="mb-2"
                >
                  <strong>{{ t('nodes.breakers') }}:</strong>
                  <span
                    v-for="b in trippedBreakers(item)"
                    :key="b.name"
                    class="ml-2"
                  ><code>{{ b.name }}</code>: {{ b.tripped }}</span>
                </div>
                <div v-if="item.threadPoolsOfInterest.length">
                  <strong>{{ t('nodes.threadPools') }}:</strong>
                  <table class="ml-2 text-caption">
                    <tr>
                      <th>name</th>
                      <th>active</th>
                      <th>queue</th>
                      <th>rejected</th>
                    </tr>
                    <tr
                      v-for="tp in item.threadPoolsOfInterest"
                      :key="tp.name"
                    >
                      <td><code>{{ tp.name }}</code></td>
                      <td>{{ tp.active }}</td>
                      <td>{{ tp.queue }}</td>
                      <td>{{ tp.rejected }}</td>
                    </tr>
                  </table>
                </div>
                <div
                  v-if="item.indexingPressure"
                  class="mt-2"
                >
                  <strong>{{ t('nodes.indexingPressure') }}:</strong>
                  combined={{ formatBytes(item.indexingPressure.currentCombinedBytes, locale) }},
                  primary={{ formatBytes(item.indexingPressure.currentPrimaryBytes, locale) }},
                  coord={{ formatBytes(item.indexingPressure.currentCoordinatingBytes, locale) }}
                </div>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Long-running tasks: empty state when both buckets are empty -->
    <v-card
      v-if="data && !data.longTasks.search.items.length && !data.longTasks.other.items.length"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('longTasks.title') }}
      </v-card-title>
      <v-card-text class="text-medium-emphasis">
        {{ t('longTasks.none') }}
      </v-card-text>
    </v-card>

    <!-- Long-running search queries -->
    <v-card
      v-if="data?.longTasks?.search?.items?.length"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('longTasks.searchTitle') }}
      </v-card-title>
      <v-alert
        v-if="data.longTasks.search.truncated"
        type="warning"
        variant="tonal"
        class="mx-4 mb-2"
      >
        {{ t('longTasks.truncated', { shown: data.longTasks.search.items.length, total: data.longTasks.search.totalCount }) }}
      </v-alert>
      <v-data-table
        :headers="searchTaskHeaders"
        :items="data.longTasks.search.items"
        item-value="id"
        :items-per-page="25"
        density="compact"
        show-expand
      >
        <template #item.runningTimeMs="{ item }">
          {{ Math.round(item.runningTimeMs) }} ms
        </template>
        <template #item.primary="{ item }">
          <template v-if="item.targets[0]?.datasetId">
            <a
              :href="`/data-fair/dataset/${item.targets[0].datasetId}`"
              target="_top"
              class="simple-link"
            >{{ item.targets[0].datasetTitle || item.targets[0].datasetId }}</a>
          </template>
          <template v-else-if="item.targets[0]">
            <code>{{ item.targets[0].indexName }}</code>
          </template>
          <span
            v-else
            class="text-medium-emphasis"
          >—</span>
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <div
                v-if="item.sourceQuery"
                class="my-2"
              >
                <strong>{{ t('longTasks.sourceQuery') }}:</strong>
                <pre class="text-caption">{{ JSON.stringify(item.sourceQuery, null, 2) }}</pre>
              </div>
              <div
                v-else-if="item.sourceQueryOversized"
                class="my-2 text-medium-emphasis"
              >
                {{ t('longTasks.sourceQueryOversized') }}
                <pre class="text-caption mt-1">{{ item.description }}</pre>
              </div>
              <pre
                v-else
                class="text-caption"
              >{{ item.description }}</pre>
              <div v-if="item.targets.length > 1">
                <strong>{{ t('longTasks.otherTargets') }}:</strong>
                <ul>
                  <li
                    v-for="(tgt, i) in item.targets.slice(1)"
                    :key="i"
                  >
                    <a
                      v-if="tgt.datasetId"
                      :href="`/data-fair/dataset/${tgt.datasetId}`"
                      target="_top"
                      class="simple-link"
                    >{{ tgt.datasetTitle || tgt.datasetId }}</a>
                    <code v-else>{{ tgt.indexName }}</code>
                  </li>
                </ul>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Other long-running tasks -->
    <v-card
      v-if="data?.longTasks?.other?.items?.length"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('longTasks.otherTitle') }}
      </v-card-title>
      <v-alert
        v-if="data.longTasks.other.truncated"
        type="warning"
        variant="tonal"
        class="mx-4 mb-2"
      >
        {{ t('longTasks.truncated', { shown: data.longTasks.other.items.length, total: data.longTasks.other.totalCount }) }}
      </v-alert>
      <v-data-table
        :headers="otherTaskHeaders"
        :items="data.longTasks.other.items"
        item-value="id"
        :items-per-page="25"
        density="compact"
        show-expand
      >
        <template #item.category="{ item }">
          <v-chip
            :color="categoryColor(item.category)"
            size="x-small"
          >
            {{ item.category }}
          </v-chip>
        </template>
        <template #item.runningTimeMs="{ item }">
          {{ Math.round(item.runningTimeMs) }} ms
        </template>
        <template #item.primary="{ item }">
          <template v-if="item.targets[0]?.datasetId">
            <a
              :href="`/data-fair/dataset/${item.targets[0].datasetId}`"
              target="_top"
              class="simple-link"
            >{{ item.targets[0].datasetTitle || item.targets[0].datasetId }}</a>
          </template>
          <template v-else-if="item.targets[0]">
            <code>{{ item.targets[0].indexName }}</code>
          </template>
          <span
            v-else
            class="text-medium-emphasis"
          >—</span>
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <pre class="text-caption">{{ item.description }}</pre>
              <div v-if="item.targets.length > 1">
                <strong>{{ t('longTasks.otherTargets') }}:</strong>
                <ul>
                  <li
                    v-for="(tgt, i) in item.targets.slice(1)"
                    :key="i"
                  >
                    <a
                      v-if="tgt.datasetId"
                      :href="`/data-fair/dataset/${tgt.datasetId}`"
                      target="_top"
                      class="simple-link"
                    >{{ tgt.datasetTitle || tgt.datasetId }}</a>
                    <code v-else>{{ tgt.indexName }}</code>
                  </li>
                </ul>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Unassigned shards -->
    <v-card
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('unassignedShards.title') }}
      </v-card-title>
      <v-card-text
        v-if="!data?.unassignedShards?.length"
        class="text-medium-emphasis"
      >
        {{ t('unassignedShards.none') }}
      </v-card-text>
      <v-data-table
        v-else
        :headers="unassignedHeaders"
        :items="unassignedShardRows"
        item-value="rowKey"
        :items-per-page="25"
        density="compact"
        show-expand
      >
        <template #item.index="{ item }">
          <a
            v-if="item.datasetId"
            :href="`/data-fair/dataset/${item.datasetId}`"
            target="_top"
            class="simple-link"
          >{{ item.datasetTitle || item.datasetId }}</a>
          <code v-else>{{ item.index }}</code>
        </template>
        <template #item.primary="{ item }">
          {{ item.primary ? 'primary' : 'replica' }}
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <pre class="text-caption">{{ item.details ?? '—' }}</pre>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Indices summary -->
    <v-card
      v-if="data?.indicesSummary"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('indices.title') }}
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.nbDataFairIndices') }}
            </div>
            <div class="text-body-medium">
              {{ data.indicesSummary.nbDataFairIndices }}
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.nbDatasetsWithIndex') }}
            </div>
            <div class="text-body-medium">
              {{ data.indicesSummary.nbDatasetsWithIndex }} / {{ data.indicesSummary.nbDatasetsInMongo }}
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.totalDocs') }}
            </div>
            <div class="text-body-medium">
              {{ data.indicesSummary.totalDocs }}
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.totalPrimary') }}
            </div>
            <div class="text-body-medium">
              {{ formatBytes(data.indicesSummary.totalPrimaryBytes, locale) }}
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.deletedRatio') }}
            </div>
            <div class="text-body-medium">
              {{ (data.indicesSummary.deletedRatio * 100).toFixed(1) }}%
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('indices.orphans') }}
            </div>
            <div class="text-body-medium">
              {{ data.indicesSummary.orphanIndicesCount }}
              <v-chip
                v-if="data.indicesSummary.orphanIndicesCount > 0"
                color="warning"
                size="x-small"
                class="ml-1"
              >
                !
              </v-chip>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Datasets with ES warnings (moved from errors.vue) -->
    <template v-if="data?.datasetsWithEsWarnings">
      <h3 class="text-title-large mt-6">
        {{ t('warnings.title') }}
      </h3>
      <p
        v-if="data.datasetsWithEsWarnings.count === 0"
        class="text-medium-emphasis"
      >
        {{ t('warnings.none') }}
      </p>
      <v-sheet
        v-else
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="w in data.datasetsWithEsWarnings.results"
            :key="w.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/dataset/${w.id}`"
                target="_top"
                class="simple-link"
              >{{ w.title }} ({{ w.owner.name }})</a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ w.esWarning }}</v-list-item-subtitle>
            <template #append>
              <v-btn
                :icon="mdiPlay"
                color="primary"
                :title="t('warnings.reindex')"
                variant="text"
                :loading="reindex.loading.value"
                @click="reindex.execute(w.id)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <v-progress-circular
      v-if="diagnoseFetch.loading.value && !data"
      indeterminate
      color="admin"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Elasticsearch
  refresh: Rafraîchir
  lastFetched: 'Dernière mise à jour : {time}'
  partialErrors: Certaines sections n'ont pas pu être chargées
  cluster:
    title: Cluster
    dataNodes: Nœuds data
    activeShards: Shards actifs
    unassigned: Non assignés
    relocating: En déplacement
    initializing: En initialisation
    pendingTasks: Tâches en attente
    pendingTasksAge: 'max age {age} ms'
  nodes:
    title: Nœuds
    breakers: Disjoncteurs déclenchés
    threadPools: Pools de threads (queue / rejected)
    indexingPressure: Pression d'indexation
    shardCap: Proche de la limite de shards par nœud
  longTasks:
    title: Tâches longues
    searchTitle: Requêtes de recherche longues
    otherTitle: Autres tâches longues
    none: Aucune tâche au-delà du seuil
    otherTargets: Autres cibles
    sourceQuery: Requête source
    sourceQueryOversized: Requête trop volumineuse pour être affichée — description brute ci-dessous
    truncated: 'Affichage des {shown} premières sur {total} — le cluster est peut-être saturé (tâches en attente, rejets de pool de threads, requêtes bloquées).'
    headers:
      running: durée
      target: cible
      node: nœud
      category: catégorie
      action: action
  unassignedShards:
    title: Shards non assignés
    none: Aucun shard non assigné
  indices:
    title: Index data-fair
    nbDataFairIndices: Index
    nbDatasetsWithIndex: Datasets avec index
    totalDocs: Documents (total)
    totalPrimary: Stockage primaire
    deletedRatio: Documents supprimés
    orphans: Index orphelins
  warnings:
    title: Jeux de données avec avertissements Elasticsearch
    none: Aucun jeu de données avec avertissements Elasticsearch
    reindex: Réindexer
en:
  title: Elasticsearch
  refresh: Refresh
  lastFetched: 'Last fetched: {time}'
  partialErrors: Some sections failed to load
  cluster:
    title: Cluster
    dataNodes: Data nodes
    activeShards: Active shards
    unassigned: Unassigned
    relocating: Relocating
    initializing: Initializing
    pendingTasks: Pending tasks
    pendingTasksAge: 'max age {age} ms'
  nodes:
    title: Nodes
    breakers: Tripped breakers
    threadPools: Thread pools (queue / rejected)
    indexingPressure: Indexing pressure
    shardCap: Near per-node shard cap
  longTasks:
    title: Long-running tasks
    searchTitle: Long-running search queries
    otherTitle: Other long-running tasks
    none: No long-running tasks above the configured threshold
    otherTargets: Other targets
    sourceQuery: Source query
    sourceQueryOversized: Query too large to display inline — raw description below
    truncated: 'Showing top {shown} of {total} — cluster may be saturated (pending tasks, thread-pool rejections, stuck queries).'
    headers:
      running: running
      target: target
      node: node
      category: category
      action: action
  unassignedShards:
    title: Unassigned shards
    none: No unassigned shards
  indices:
    title: Data-fair indices
    nbDataFairIndices: Indices
    nbDatasetsWithIndex: Datasets with index
    totalDocs: Total docs
    totalPrimary: Primary storage
    deletedRatio: Deleted docs
    orphans: Orphan indices
  warnings:
    title: Datasets with Elasticsearch warnings
    none: No datasets with Elasticsearch warnings
    reindex: Reindex
</i18n>

<script setup lang="ts">
import { mdiRefresh, mdiPlay } from '@mdi/js'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t, locale } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

type LongTaskBucket = {
  items: any[]
  totalCount: number
  truncated: boolean
}
type DiagnoseResponse = {
  cluster: any | null
  nodes: any[]
  longTasks: { search: LongTaskBucket, other: LongTaskBucket }
  unassignedShards: any[]
  indicesSummary: any | null
  datasetsWithEsWarnings: { count: number, results: any[] }
  errors: Array<{ section: string, message: string }>
}

const diagnoseFetch = useFetch<DiagnoseResponse>($apiPath + '/admin/elasticsearch/diagnose')
const data = computed(() => diagnoseFetch.data.value)

const lastFetchedAt = ref<Date | null>(null)
watch(() => diagnoseFetch.data.value, v => { if (v) lastFetchedAt.value = new Date() })
const lastFetchedLabel = computed(() => lastFetchedAt.value
  ? t('lastFetched', { time: lastFetchedAt.value.toLocaleTimeString() })
  : '')

const refresh = () => diagnoseFetch.refresh()

const reindex = useAsyncAction(async (datasetId: string) => {
  await $fetch(`datasets/${datasetId}/_reindex`, { method: 'POST' })
  diagnoseFetch.refresh()
})

const statusColor = (s: string) => s === 'green' ? 'success' : s === 'yellow' ? 'warning' : 'error'
const watermarkColor = (w: string) => w === 'flood' ? 'error' : 'warning'

const pctOrDash = (v: number | null) => v == null ? '—' : `${Math.round(v)}%`
const numOrDash = (v: number | null) => v == null ? '—' : (Math.round(v * 100) / 100).toString()

const shardCellLabel = (n: any) => {
  if (n.shardCount == null) return '—'
  if (n.maxShardsPerNode == null) return `${n.shardCount}`
  return `${n.shardCount} / ${n.maxShardsPerNode}`
}

const isShardCapNear = (n: any) =>
  n.shardCount != null && n.maxShardsPerNode != null &&
  n.shardCount >= 0.9 * n.maxShardsPerNode

const trippedBreakers = (n: any) => Object.entries(n.breakers ?? {})
  .map(([name, b]: any) => ({ name, tripped: (b as any).tripped }))
  .filter(b => b.tripped > 0)

const clusterKpis = computed(() => {
  const c = data.value?.cluster
  if (!c) return []
  return [
    { label: t('cluster.dataNodes'), value: `${c.numberOfDataNodes} / ${c.numberOfNodes}` },
    { label: t('cluster.activeShards'), value: c.activeShards },
    { label: t('cluster.unassigned'), value: c.unassignedShards },
    { label: t('cluster.relocating'), value: c.relocatingShards },
    { label: t('cluster.initializing'), value: c.initializingShards },
    { label: t('cluster.pendingTasks'), value: `${c.pendingTasks.count} (${t('cluster.pendingTasksAge', { age: c.pendingTasks.maxAgeMs ?? 0 })})` }
  ]
})

const nodeHeaders = [
  { title: 'name', key: 'name' },
  { title: 'roles', key: 'roles' },
  { title: 'heap', key: 'heapUsedPct' },
  { title: 'cpu', key: 'cpuPct' },
  { title: 'load 1m', key: 'load1m' },
  { title: 'disk', key: 'disk' },
  { title: 'shards', key: 'shardCount' },
  { title: '', key: 'data-table-expand' }
]

const searchTaskHeaders = [
  { title: t('longTasks.headers.running'), key: 'runningTimeMs' },
  { title: t('longTasks.headers.target'), key: 'primary' },
  { title: t('longTasks.headers.node'), key: 'node' },
  { title: '', key: 'data-table-expand' }
]

const otherTaskHeaders = [
  { title: t('longTasks.headers.category'), key: 'category' },
  { title: t('longTasks.headers.action'), key: 'action' },
  { title: t('longTasks.headers.running'), key: 'runningTimeMs' },
  { title: t('longTasks.headers.target'), key: 'primary' },
  { title: t('longTasks.headers.node'), key: 'node' },
  { title: '', key: 'data-table-expand' }
]

// Items in the "other" bucket carry categories 'write' | 'admin' | 'other'.
// 'search' never appears here — the API splits search tasks into a separate bucket.
const categoryColor = (c: 'write' | 'admin' | 'other'): string | undefined =>
  c === 'write' ? 'warning' : c === 'admin' ? 'info' : undefined

const unassignedShardRows = computed(() =>
  (data.value?.unassignedShards ?? []).map(s => ({
    ...s,
    rowKey: `${s.index}#${s.shard}#${s.primary ? 'p' : 'r'}`
  }))
)

const unassignedHeaders = [
  { title: 'index / dataset', key: 'index' },
  { title: 'shard', key: 'shard' },
  { title: 'role', key: 'primary' },
  { title: 'reason', key: 'reason' },
  { title: '', key: 'data-table-expand' }
]
</script>
