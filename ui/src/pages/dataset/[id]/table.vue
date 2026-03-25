<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <dataset-table :height="contentHeight" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  table: Tableau
en:
  datasets: Datasets
  table: Table
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/table'>()
const { height: windowHeight } = useWindowSize()

const store = provideDatasetStore(route.params.id, true, true)
const { dataset } = store

useDatasetWatch(store, ['info'])

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
