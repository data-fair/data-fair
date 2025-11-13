<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-search-files
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
const draft = useBooleanSearchParam('draft')

provideDatasetStore(route.params.id, draft.value ?? undefined, true)

const q = useStringSearchParam('q')
</script>

<style>
</style>
