<template>
  <v-container
    fluid
    class="pa-0"
  >
    <dataset-table />
  </v-container>
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'

const route = useRoute<'/embed/dataset/[id]/table'>()

provideDatasetStore(route.params.id)
</script>

<style>
</style>
