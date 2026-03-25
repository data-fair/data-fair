<template>
  <v-container v-if="datasetEditFetch.data.value">
    <v-row class="dataset">
      <v-col>
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <layout-section-tabs
            v-if="section.id === 'info'"
            :id="section.id"
            v-model="infoTab"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
            :svg="infoSvg"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <dataset-info v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item value="metadata">
                  <v-container fluid>
                    <dataset-metadata-form v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item
                  v-if="!datasetEditFetch.data.value?.draftReason"
                  value="attachments"
                >
                  <dataset-attachments />
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'structure'"
            :id="section.id"
            v-model="structureTab"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
            :svg="buildingSvg"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="schema">
                  <v-container fluid>
                    <dataset-schema
                      v-model="datasetEditFetch.data.value.schema"
                      :dataset="datasetEditFetch.data.value"
                      :primary-key="datasetEditFetch.data.value.primaryKey"
                      @update:primary-key="pk => { if (datasetEditFetch.data.value) datasetEditFetch.data.value.primaryKey = pk }"
                    />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item value="extensions">
                  <v-container fluid>
                    <dataset-extensions
                      v-model="datasetEditFetch.data.value"
                      @refresh="onRefreshExtension"
                    />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item value="master-data">
                  <v-container fluid>
                    <dataset-master-data v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'virtual'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
            :svg="dataSvg"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="virtual">
                  <v-container fluid>
                    <dataset-virtual v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
        </template>
      </v-col>
    </v-row>

    <df-navigation-right>
      <v-list
        v-if="datasetEditFetch.hasDiff.value"
        bg-color="background"
      >
        <v-list-item>
          <v-btn
            width="100%"
            color="accent"
            :loading="datasetEditFetch.save.loading.value"
            @click="showSaveDialog = true"
          >
            {{ t('save') }}
          </v-btn>
        </v-list-item>
      </v-list>
      <layout-toc :sections="sections" />
    </df-navigation-right>

    <dataset-save-dialog
      v-model="showSaveDialog"
      :data="datasetEditFetch.data.value"
      :server-data="datasetEditFetch.serverData.value"
      @confirm="datasetEditFetch.save.execute()"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editMetadata: Éditer les métadonnées
  info: Informations
  metadata: Métadonnées
  structure: Structure
  schema: Schéma
  attachments: Pièces jointes
  extensions: Enrichissements
  masterData: Données de référence
  virtual: Jeu de données virtuel
  save: Enregistrer
  saved: Les modifications ont été enregistrées
en:
  datasets: Datasets
  editMetadata: Edit metadata
  info: Information
  metadata: Metadata
  structure: Structure
  schema: Schema
  attachments: Attachments
  extensions: Extensions
  masterData: Master data
  virtual: Virtual dataset
  save: Save
  saved: Changes were saved
</i18n>

<script lang="ts" setup>
import infoSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiAlert, mdiAttachment, mdiDatabase, mdiInformation, mdiPuzzle, mdiSetAll, mdiTableCog, mdiTag } from '@mdi/js'
import { useAgentSummaryTools } from '~/composables/use-agent-summary-tools'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import { useBreadcrumbs } from '~/composables/use-breadcrumbs'
import equal from 'fast-deep-equal'

const { t, locale } = useI18n()
const { accountRole } = useSessionAuthenticated()
const route = useRoute<'/dataset/[id]/edit-metadata'>()

// Provide dataset store for child components that need it (dataset-attachments, dataset-status)
const store = provideDatasetStore(route.params.id, true)
useDatasetWatch(store, ['info'])

// useEditFetch for the central editable dataset
const datasetEditFetch = useEditFetch<any>(`${$apiPath}/datasets/${route.params.id}`, {
  query: { draft: true },
  patch: true,
  saveOptions: {
    success: t('saved')
  }
})
useLeaveGuard(datasetEditFetch.hasDiff, { locale })

useAgentSummaryTools(locale, route.params.id, (s) => {
  if (datasetEditFetch.data.value) datasetEditFetch.data.value.summary = s
})

const breadcrumbs = useBreadcrumbs()
const showSaveDialog = ref(false)
const infoTab = ref('info')
const structureTab = ref('schema')

const onRefreshExtension = async (extension: any) => {
  await store.patchDataset.execute({ extensions: [{ ...extension, needsUpdate: true }] })
  // Refresh editFetch to sync serverData after the server-side patch
  await datasetEditFetch.fetch.refresh()
}

watch(datasetEditFetch.data, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('editMetadata') }
    ]
  })
}, { immediate: true })

// Diff detection per section
const infoHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return d.title !== s.title ||
    d.description !== s.description ||
    d.summary !== s.summary ||
    d.slug !== s.slug ||
    !equal(d.rest, s.rest)
})

const metadataHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.license, s.license) ||
    !equal(d.topics, s.topics) ||
    !equal(d.keywords, s.keywords) ||
    d.origin !== s.origin ||
    d.image !== s.image ||
    d.creator !== s.creator ||
    d.frequency !== s.frequency ||
    d.spatial !== s.spatial ||
    !equal(d.temporal, s.temporal) ||
    d.modified !== s.modified ||
    d.projection !== s.projection ||
    d.attachmentsAsImage !== s.attachmentsAsImage ||
    !equal(d.customMetadata, s.customMetadata)
})

const schemaHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.schema, s.schema) || !equal(d.primaryKey, s.primaryKey)
})

const extensionsHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.extensions, s.extensions)
})

const masterDataHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.masterData, s.masterData)
})

const virtualHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.virtual, s.virtual) || !equal(d.schema, s.schema)
})

const sections = computedDeepDiff(() => {
  const d = datasetEditFetch.data.value
  if (!d) return []

  const infoOrMetaDiff = infoHasDiff.value || metadataHasDiff.value
  const structureDiff = schemaHasDiff.value || extensionsHasDiff.value || masterDataHasDiff.value

  const infoTabs: any[] = [
    {
      key: 'info',
      title: t('info'),
      icon: mdiInformation,
      appendIcon: infoHasDiff.value ? mdiAlert : undefined,
      color: infoHasDiff.value ? 'accent' : undefined
    },
    {
      key: 'metadata',
      title: t('metadata'),
      icon: mdiTag,
      appendIcon: metadataHasDiff.value ? mdiAlert : undefined,
      color: metadataHasDiff.value ? 'accent' : undefined
    }
  ]
  if (!d.draftReason) {
    infoTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment })
  }

  const structureTabs: any[] = [{
    key: 'schema',
    title: t('schema'),
    icon: mdiTableCog,
    appendIcon: schemaHasDiff.value ? mdiAlert : undefined,
    color: schemaHasDiff.value ? 'accent' : undefined
  }]

  // Extensions tab (non-virtual, non-meta-only datasets)
  if (!d.isVirtual && !d.isMetaOnly) {
    structureTabs.push({
      key: 'extensions',
      title: t('extensions'),
      icon: mdiPuzzle,
      appendIcon: extensionsHasDiff.value ? mdiAlert : undefined,
      color: extensionsHasDiff.value ? 'accent' : undefined
    })
  }

  // Master data tab (admin only, finalized, non-meta-only)
  if (!d.draftReason && !d.isMetaOnly && accountRole.value === 'admin') {
    structureTabs.push({
      key: 'master-data',
      title: t('masterData'),
      icon: mdiDatabase,
      appendIcon: masterDataHasDiff.value ? mdiAlert : undefined,
      color: masterDataHasDiff.value ? 'accent' : undefined
    })
  }

  const result: any[] = [
    {
      title: t('info'),
      id: 'info',
      color: infoOrMetaDiff ? 'accent' : undefined,
      tabs: infoTabs
    },
    {
      title: t('structure'),
      id: 'structure',
      color: structureDiff ? 'accent' : undefined,
      tabs: structureTabs
    }
  ]

  // Virtual dataset section
  if (d.isVirtual) {
    result.push({
      title: t('virtual'),
      id: 'virtual',
      color: virtualHasDiff.value ? 'accent' : undefined,
      tabs: [{
        key: 'virtual',
        title: t('virtual'),
        icon: mdiSetAll,
        appendIcon: virtualHasDiff.value ? mdiAlert : undefined,
        color: virtualHasDiff.value ? 'accent' : undefined
      }]
    })
  }

  return result
})
</script>

<style>
.dataset .v-tab {
  font-weight: bold;
}
</style>
