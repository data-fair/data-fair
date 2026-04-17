<template>
  <layout-fetch-error
    v-if="store.datasetFetch.error.value"
    :error="store.datasetFetch.error.value"
    resource-type="dataset"
  />
  <router-view v-else />
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import LayoutFetchError from '~/components/layout/layout-fetch-error.vue'

definePage({ alias: '/datasets/:id' })

const route = useRoute<'/dataset/[id]'>()
const store = provideDatasetStore(route.params.id, true, 'vuetify')
</script>
