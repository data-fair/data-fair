<template>
  <v-container
    v-if="dataset && dataset.isRest"
    class="pa-0"
    fluid
  >
    <dataset-table
      :height="contentHeight"
      edit
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editData: Éditer les données
en:
  datasets: Datasets
  editData: Edit data
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

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('editData') }
    ]
  })
}, { immediate: true })
</script>
