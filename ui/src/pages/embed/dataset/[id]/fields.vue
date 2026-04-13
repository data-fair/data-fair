<template>
  <v-container data-iframe-height>
    <div class="text-center">
      <dataset-schema-download />
    </div>
    <dataset-schema-view />
  </v-container>
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset/dataset-store'

const route = useRoute<'/embed/dataset/[id]/fields'>()

provideDatasetStore(route.params.id, false, true)
</script>
