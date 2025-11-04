<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-map-bounds
      :height="windowHeight"
    />
  </v-container>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'

useFrameContent()
const { height: windowHeight } = useWindowSize()

const route = useRoute<'/dataset/[id]/map-bounds'>()

provideDatasetStore(route.params.id)
</script>

<style>
</style>
