<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-thumbnails
      v-model:q="q"
      :height="windowHeight"
    />
  </v-container>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'

const { height: windowHeight } = useWindowSize()

useFrameContent()
const route = useRoute<'/dataset/[id]/search-files'>()

provideDatasetStore(route.params.id, false, true)

const q = useStringSearchParam('q')
</script>

<style>
</style>
