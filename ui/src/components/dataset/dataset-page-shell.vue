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

const { t } = useI18n()
const props = defineProps<{ id: string }>()
const store = provideDatasetStore(props.id, true, 'vuetify')
</script>

<i18n lang="yaml">
fr:
  backToDatasets: Retour aux jeux de données
en:
  backToDatasets: Back to datasets
</i18n>
