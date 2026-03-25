<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <dataset-search-files :height="contentHeight" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  files: Fichiers
en:
  datasets: Datasets
  files: Files
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute()
const { height: windowHeight } = useWindowSize()

const store = provideDatasetStore(route.params.id as string, true, true)
const { dataset } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - 120)

watch(dataset, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id, to: `/dataset/${d.id}` },
    { text: t('files') }
  ])
}, { immediate: true })
</script>
