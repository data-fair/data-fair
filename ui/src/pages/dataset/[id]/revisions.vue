<template>
  <v-container
    v-if="dataset"
    fluid
    class="pa-0"
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

<script lang="ts" setup>
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import { useBreadcrumbs } from '~/composables/use-breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/revisions'>()
const breadcrumbs = useBreadcrumbs()

const store = provideDatasetStore(route.params.id, true, true)
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
