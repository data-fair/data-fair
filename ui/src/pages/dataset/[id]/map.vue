<template>
  <v-container
    v-if="dataset"
    class="pa-0"
    fluid
  >
    <dataset-map
      v-if="dataset.bbox"
      :height="contentHeight"
      :category="category"
    />
    <v-alert
      v-else
      type="info"
      class="ma-4"
      :text="t('unavailable')"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  map: Carte
  unavailable: Ce jeu de données n'a pas de données géographiques à afficher sur une carte.
en:
  datasets: Datasets
  map: Map
  unavailable: This dataset has no geographic data to show on a map.
</i18n>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { useLayout } from 'vuetify'
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { height: windowHeight } = useWindowSize()
const { mainRect } = useLayout()
const breadcrumbs = useBreadcrumbs()

const store = useDatasetStore()
const { dataset } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - mainRect.value.top - mainRect.value.bottom)
const category = useStringSearchParam('category')

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('map') }
    ]
  })
}, { immediate: true })
</script>
