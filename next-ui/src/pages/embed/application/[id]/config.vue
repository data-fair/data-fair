<template lang="html">
  <application-config
    :ro-dataset="$route.query.roDataset === 'true'"
    data-iframe-height
  />
</template>

<script setup lang="ts">
import { createApplicationStore } from '~/composables/application-store'

const route = useRoute<'/embed/application/[id]/config'>()

createApplicationStore(route.params.id)
</script>
