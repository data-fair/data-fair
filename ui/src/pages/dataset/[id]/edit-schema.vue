<template>
  <v-container v-if="datasetEditFetch.data.value">
    <v-row class="dataset">
      <v-col>
        <df-section-tabs
          v-if="sections.structure"
          id="structure"
          v-model="structureTab"
          :min-height="300"
          :title="sections.structure.title"
          :tabs="sections.structure.tabs"
          :color="sections.structure.color"
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
        </df-section-tabs>

        <df-section-tabs
          v-if="sections.virtual"
          id="virtual"
          :min-height="300"
          :title="sections.virtual.title"
          :tabs="sections.virtual.tabs"
          :color="sections.virtual.color"
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
        </df-section-tabs>
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
            @click="datasetEditFetch.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </v-list-item>
        <v-list-item>
          <confirm-menu
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            :btn-props="{ width: '100%', color: 'warning', variant: 'tonal' }"
            @confirm="cancelChanges"
          />
        </v-list-item>
      </v-list>
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editSchema: Éditer le schéma
  structure: Structure
  schema: Schéma
  extensions: Enrichissements
  masterData: Données de référence
  virtual: Jeu de données virtuel
  save: Enregistrer
  saved: Les modifications ont été enregistrées
  cancel: Annuler
  confirmCancelText: Souhaitez-vous annuler vos modifications ?
en:
  datasets: Datasets
  editSchema: Edit schema
  structure: Structure
  schema: Schema
  extensions: Extensions
  masterData: Master data
  virtual: Virtual dataset
  save: Save
  saved: Changes were saved
  cancel: Cancel
  confirmCancelText: Do you want to discard your changes?
</i18n>

<script setup lang="ts">
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiAlert, mdiCancel, mdiDatabase, mdiPuzzle, mdiSetAll, mdiTableCog } from '@mdi/js'
import { useAgentExpressionTools } from '~/composables/dataset/agent-expression-tools'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import equal from 'fast-deep-equal'

const { t, locale } = useI18n()
const { accountRole } = useSessionAuthenticated()
const route = useRoute<'/dataset/[id]/edit-schema'>()

// Provide dataset store for child components
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

useAgentExpressionTools(locale, datasetEditFetch.data, (extensionIndex, expr) => {
  if (datasetEditFetch.data.value?.extensions?.[extensionIndex]) {
    datasetEditFetch.data.value.extensions[extensionIndex].expr = expr
  }
})

const breadcrumbs = useBreadcrumbs()
const structureTab = ref('schema')

const onRefreshExtension = async (extension: any) => {
  await store.patchDataset.execute({ extensions: [{ ...extension, needsUpdate: true }] })
  // Refresh editFetch to sync serverData after the server-side patch
  await datasetEditFetch.fetch.refresh()
}

const cancelChanges = () => {
  if (datasetEditFetch.serverData.value) {
    datasetEditFetch.data.value = JSON.parse(JSON.stringify(datasetEditFetch.serverData.value))
  }
}

watch(datasetEditFetch.data, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('editSchema') }
    ]
  })
}, { immediate: true })

// Diff detection per section
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
  if (!d) return {} as Record<string, { title: string, color?: string, tabs: any[] }>

  const structureDiff = schemaHasDiff.value || extensionsHasDiff.value || masterDataHasDiff.value

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

  const result: Record<string, { title: string, color?: string, tabs: any[] }> = {
    structure: {
      title: t('structure'),
      color: structureDiff ? 'accent' : undefined,
      tabs: structureTabs
    }
  }

  // Virtual dataset section
  if (d.isVirtual) {
    result.virtual = {
      title: t('virtual'),
      color: virtualHasDiff.value ? 'accent' : undefined,
      tabs: [{
        key: 'virtual',
        title: t('virtual'),
        icon: mdiSetAll,
        appendIcon: virtualHasDiff.value ? mdiAlert : undefined,
        color: virtualHasDiff.value ? 'accent' : undefined
      }]
    }
  }

  return result
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))
</script>
