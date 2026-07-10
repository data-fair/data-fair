<template>
  <v-container
    :style="`height: ${windowHeight}px`"
    class="pa-0"
    fluid
  >
    <dataset-table
      v-model:cols="cols"
      v-model:display="display"
      v-model:q="q"
      v-model:sort="sort"
      :height="windowHeight"
      :no-interaction="!interaction"
      :edit="true"
      :own-lines="ownLines"
    />
  </v-container>
</template>

<script setup lang="ts">
// exemple avec volumétrie, historique DPE:
// https://koumoul.com/data-fair/embed/dataset/rr6wq5gxjqpm-89iyna6n4dz/table

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/table-edit'>()

const store = provideDatasetStore(route.params.id, undefined, true)
// subscribe to background changes so the editable embed refreshes its rows
// like the back-office table (reloads on finalize-end via the changed finalizedAt)
useDatasetWatch(store, ['info'])

const cols = useStringsArraySearchParam('cols')
const display = useStringSearchParam('display', 'table')
const q = useStringSearchParam('q')
const sort = useStringSearchParam('sort')
const interaction = useBooleanSearchParam('interaction', true)
// ?ownLines=true restricts the embedded editable table to the active account's own lines
const ownLines = useBooleanSearchParam('ownLines')
</script>
