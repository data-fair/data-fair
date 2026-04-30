<template>
  <v-container
    :style="`height: ${windowHeight}px`"
    class="pa-0"
    fluid
  >
    <dataset-map-bounds :height="windowHeight" />
  </v-container>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/map-bounds'>()
const draft = useBooleanSearchParam('draft')

provideDatasetStore(route.params.id, draft.value ?? undefined)
</script>
