<template>
  <v-container
    fluid
    class="pa-0"
    :style="`height: ${windowHeight}px`"
  >
    <dataset-table
      v-model:cols="cols"
      v-model:display="display"
      v-model:q="q"
      v-model:sort="sort"
      :height="windowHeight"
      :no-interaction="!interaction"
      :edit="true"
    />
  </v-container>
</template>

<script setup lang="ts">
// exemple avec volumétrie, historique DPE:
// https://koumoul.com/data-fair/embed/dataset/rr6wq5gxjqpm-89iyna6n4dz/table

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset-store'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/dataset/[id]/table'>()

provideDatasetStore(route.params.id, undefined, true)

const cols = useStringsArraySearchParam('cols')
const display = useStringSearchParam('display', 'table')
const q = useStringSearchParam('q')
const sort = useStringSearchParam('sort')
const interaction = useBooleanSearchParam('interaction', true)
</script>

<style>
</style>
