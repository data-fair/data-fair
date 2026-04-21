<template>
  <df-layout-fetch-error
    v-if="store.datasetFetch.error.value"
    :error="store.datasetFetch.error.value"
    :back-label="t('backToDatasets')"
    back-to="/datasets"
  />
  <router-view v-else />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset/dataset-store'

definePage({ alias: '/datasets/:id' })

const { t } = useI18n()
const route = useRoute<'/dataset/[id]'>()
const store = provideDatasetStore(route.params.id, true, 'vuetify')
</script>

<i18n lang="yaml">
fr:
  backToDatasets: Retour aux jeux de données
en:
  backToDatasets: Back to datasets
</i18n>
