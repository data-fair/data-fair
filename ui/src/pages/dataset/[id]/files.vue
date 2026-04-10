<template>
  <v-container
    v-if="dataset"
    class="pa-0"
    fluid
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

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { useLayout } from 'vuetify'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/files'>()
const { height: windowHeight } = useWindowSize()
const { mainRect } = useLayout()
const breadcrumbs = useBreadcrumbs()

const store = provideDatasetStore(route.params.id, true, true)
const { dataset } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - mainRect.value.top - mainRect.value.bottom)

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('files') }
    ]
  })
}, { immediate: true })
</script>
