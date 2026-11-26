<template>
  <v-container
    v-if="dataset"
    class="pa-0"
    fluid
  >
    <dataset-thumbnails
      v-if="imageField"
      :height="contentHeight"
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
  thumbnails: Vignettes
  unavailable: Ce jeu de données n'a pas de colonne d'images.
en:
  datasets: Datasets
  thumbnails: Thumbnails
  unavailable: This dataset has no image column.
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
const { dataset, imageField } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - mainRect.value.top - mainRect.value.bottom)

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('thumbnails') }
    ]
  })
}, { immediate: true })
</script>
