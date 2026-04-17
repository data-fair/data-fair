<template>
  <layout-fetch-error
    v-if="store.applicationFetch.error.value"
    :error="store.applicationFetch.error.value"
    resource-type="application"
  />
  <router-view v-else />
</template>

<script setup lang="ts">
import { provideApplicationStore } from '~/composables/application/application-store'

definePage({ alias: '/applications/:id' })

const route = useRoute<'/application/[id]'>()
const store = provideApplicationStore(route.params.id)
</script>
