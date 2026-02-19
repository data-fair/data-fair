<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-map
      v-model:q="q"
      v-model:selected-item="selectedItem"
      :height="windowHeight"
      :no-interaction="!interaction"
      :selectable="selectable"
      :cols="cols"
    />
  </v-container>
</template>

<script setup lang="ts">
// exemple avec volumétrie, historique DPE:
// https://koumoul.com/data-fair/embed/dataset/rr6wq5gxjqpm-89iyna6n4dz/map

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/dataset/[id]/map'>()
const draft = useBooleanSearchParam('draft')

provideDatasetStore(route.params.id, draft.value ?? undefined)

const q = useStringSearchParam('q')
const interaction = useBooleanSearchParam('interaction', true)
const selectable = useBooleanSearchParam('selectable', false)
const selectedItem = useStringSearchParam('_iq_eq')
const cols = useStringsArraySearchParam('cols')
</script>

<style>
</style>
