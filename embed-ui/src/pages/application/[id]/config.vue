<template lang="html">
  <application-config
    :ro-dataset="$route.query.roDataset === 'true'"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { provideApplicationStore } from '~/composables/application-store'

useFrameContent()
const route = useRoute<'/application/[id]/config'>()

provideApplicationStore(route.params.id)
</script>
