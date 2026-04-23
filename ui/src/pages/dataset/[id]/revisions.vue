<template>
  <v-container
    v-if="dataset"
    class="pa-0"
    fluid
  >
    <dataset-history />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  revisions: Révisions
en:
  datasets: Datasets
  revisions: Revisions
</i18n>

<script setup lang="ts">
import { useDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const breadcrumbs = useBreadcrumbs()

const store = useDatasetStore()
const { dataset } = store

useDatasetWatch(store, ['info'])

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('revisions') }
    ]
  })
}, { immediate: true })
</script>
