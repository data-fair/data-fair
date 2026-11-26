<template>
  <v-container
    v-if="dataset"
    class="pa-0"
    fluid
  >
    <dataset-history v-if="dataset.rest?.history" />
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
  revisions: Révisions
  unavailable: L'historique des révisions n'est pas activé sur ce jeu de données.
en:
  datasets: Datasets
  revisions: Revisions
  unavailable: Revision history is not enabled on this dataset.
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
