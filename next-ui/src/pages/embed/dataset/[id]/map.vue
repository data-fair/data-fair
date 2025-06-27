<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-map
      v-model:q="q"
      :height="windowHeight"
      :no-interaction="!interaction"
    />
  </v-container>
</template>

<script setup lang="ts">
// exemple avec volumétrie, historique DPE:
// https://koumoul.com/data-fair/embed/dataset/rr6wq5gxjqpm-89iyna6n4dz/map

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'

useFrameContent()
const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/map'>()

provideDatasetStore(route.params.id)

const q = useStringSearchParam('q')
const interaction = useBooleanSearchParam('interaction', true)
</script>

<style>
</style>
