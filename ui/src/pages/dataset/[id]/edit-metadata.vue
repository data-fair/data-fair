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
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <dataset-info v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'schema'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
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
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'attachments'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="attachments">
                  <dataset-attachments />
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
            @click="datasetEditFetch.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </v-list-item>
      </v-list>
      <v-list
        density="compact"
        bg-color="background"
      >
        <v-list-subheader>{{ t('navigation') }}</v-list-subheader>
        <v-list-item :to="`/dataset/${route.params.id}`">
          <template #prepend>
            <v-icon color="primary">
              mdi-home
            </v-icon>
          </template>
          <v-list-item-title>{{ t('backToHome') }}</v-list-item-title>
        </v-list-item>
        <v-list-item :to="`/dataset/${route.params.id}/data`">
          <template #prepend>
            <v-icon color="primary">
              mdi-table
            </v-icon>
          </template>
          <v-list-item-title>{{ t('viewData') }}</v-list-item-title>
        </v-list-item>
      </v-list>
      <layout-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editMetadata: Éditer les métadonnées
  info: Informations
  schema: Schéma
  attachments: Pièces jointes
  save: Enregistrer
  saved: Les modifications ont été enregistrées
  navigation: NAVIGATION
  backToHome: Retour à la fiche
  viewData: Voir les données
en:
  datasets: Datasets
  editMetadata: Edit metadata
  info: Information
  schema: Schema
  attachments: Attachments
  save: Save
  saved: Changes were saved
  navigation: NAVIGATION
  backToHome: Back to home
  viewData: View data
</i18n>

<script lang="ts" setup>
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiInformation, mdiTableCog, mdiAttachment, mdiAlert } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'
import equal from 'fast-deep-equal'

const { t, locale } = useI18n()
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

watch(datasetEditFetch.data, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id, to: `/dataset/${d.id}` },
    { text: t('editMetadata') }
  ])
}, { immediate: true })

// Diff detection per section
const infoHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return d.title !== s.title ||
    d.description !== s.description ||
    d.summary !== s.summary ||
    d.origin !== s.origin ||
    d.image !== s.image ||
    d.slug !== s.slug ||
    !equal(d.license, s.license) ||
    !equal(d.topics, s.topics) ||
    !equal(d.keywords, s.keywords) ||
    !equal(d.rest, s.rest)
})

const schemaHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.schema, s.schema) || !equal(d.primaryKey, s.primaryKey)
})

const sections = computedDeepDiff(() => {
  const d = datasetEditFetch.data.value
  if (!d) return []

  const result: any[] = [
    {
      title: t('info'),
      id: 'info',
      color: infoHasDiff.value ? 'accent' : undefined,
      tabs: [{
        key: 'info',
        title: t('info'),
        icon: mdiInformation,
        appendIcon: infoHasDiff.value ? mdiAlert : undefined,
        color: infoHasDiff.value ? 'accent' : undefined
      }]
    },
    {
      title: t('schema'),
      id: 'schema',
      color: schemaHasDiff.value ? 'accent' : undefined,
      tabs: [{
        key: 'schema',
        title: t('schema'),
        icon: mdiTableCog,
        appendIcon: schemaHasDiff.value ? mdiAlert : undefined,
        color: schemaHasDiff.value ? 'accent' : undefined
      }]
    }
  ]

  if (!d.draftReason) {
    result.push({
      title: t('attachments'),
      id: 'attachments',
      tabs: [{ key: 'attachments', title: t('attachments'), icon: mdiAttachment }]
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
