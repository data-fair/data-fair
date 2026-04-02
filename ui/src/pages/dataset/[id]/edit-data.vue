<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
  >
    <!-- REST dataset: editable table -->
    <dataset-table
      v-if="dataset.isRest"
      :height="contentHeight"
      :edit="true"
    />

    <!-- File dataset: update stepper -->
    <workflow-update-dataset
      v-else-if="dataset.file"
      :initial-dataset-id="dataset.id"
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
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/edit-data'>()
const { height: windowHeight } = useWindowSize()
const breadcrumbs = useBreadcrumbs()

const store = provideDatasetStore(route.params.id, undefined, true)
const { dataset } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - 48)

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
