<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <v-tabs
      v-model="activeTab"
      bg-color="surface"
    >
      <v-tab
        v-if="can('readLines')"
        value="table"
      >
        <v-icon start>
          mdi-table
        </v-icon>
        {{ t('table') }}
      </v-tab>
      <v-tab
        v-if="dataset.bbox"
        value="map"
      >
        <v-icon start>
          mdi-map
        </v-icon>
        {{ t('map') }}
      </v-tab>
      <v-tab
        v-if="digitalDocumentField"
        value="files"
      >
        <v-icon start>
          mdi-content-copy
        </v-icon>
        {{ t('files') }}
      </v-tab>
      <v-tab
        v-if="imageField"
        value="thumbnails"
      >
        <v-icon start>
          mdi-image
        </v-icon>
        {{ t('thumbnails') }}
      </v-tab>
      <v-tab
        v-if="dataset.rest?.history"
        value="revisions"
      >
        <v-icon start>
          mdi-history
        </v-icon>
        {{ t('revisions') }}
      </v-tab>
    </v-tabs>

    <v-tabs-window
      v-model="activeTab"
      class="data-tabs-window"
    >
      <v-tabs-window-item value="table">
        <dataset-table
          :height="contentHeight"
        />
      </v-tabs-window-item>

      <v-tabs-window-item
        v-if="dataset.bbox"
        value="map"
      >
        <dataset-map
          :height="contentHeight"
        />
      </v-tabs-window-item>

      <v-tabs-window-item
        v-if="digitalDocumentField"
        value="files"
      >
        <dataset-search-files
          :height="contentHeight"
        />
      </v-tabs-window-item>

      <v-tabs-window-item
        v-if="imageField"
        value="thumbnails"
      >
        <dataset-thumbnails
          :height="contentHeight"
        />
      </v-tabs-window-item>

      <v-tabs-window-item
        v-if="dataset.rest?.history"
        value="revisions"
      >
        <dataset-history />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  table: Tableau
  map: Carte
  files: Fichiers
  thumbnails: Vignettes
  revisions: Révisions
en:
  datasets: Datasets
  table: Table
  map: Map
  files: Files
  thumbnails: Thumbnails
  revisions: Revisions
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/data'>()
const { height: windowHeight } = useWindowSize()

const store = provideDatasetStore(route.params.id, true, true)
const { dataset, digitalDocumentField, imageField, can } = store

useDatasetWatch(store, ['info'])

const activeTab = ref('table')
const contentHeight = computed(() => windowHeight.value - 120)

watch(dataset, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id, to: `/dataset/${d.id}` },
    { text: t('table') }
  ])
}, { immediate: true })
</script>

<style>
.data-tabs-window {
  overflow: visible;
}
</style>
