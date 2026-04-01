<template>
  <application-config />
</template>

<script setup lang="ts">
import { provideApplicationStore } from '~/composables/application/store'

const route = useRoute<'/application/[id]/config'>()

provideApplicationStore(route.params.id)
</script>
