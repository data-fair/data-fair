<template>
  <router-view />
</template>

<script setup lang="ts">
import { provideApplicationStore } from '~/composables/application/application-store'

definePage({ alias: '/applications/:id' })

const route = useRoute<'/application/[id]'>()
provideApplicationStore(route.params.id)
</script>
