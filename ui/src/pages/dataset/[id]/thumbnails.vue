<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <dataset-thumbnails :height="contentHeight" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  thumbnails: Vignettes
en:
  datasets: Datasets
  thumbnails: Thumbnails
</i18n>

<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/thumbnails'>()
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
    { text: t('thumbnails') }
  ])
}, { immediate: true })
</script>
