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
      :interactions="interactions"
      :edit="true"
      :own-lines="true"
    />
  </v-container>
</template>

<script setup lang="ts">
// editable table restricted to the active account's own lines, for a crowd-sourcing contributor who
// typically holds only readSafeDescription, readSafeSchema and manageOwnLines. Every read and write
// goes through the own/{owner}/* routes. No background watch: the realtime channels need permissions
// such a contributor does not hold, and the table already refreshes after its own writes.

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import { parseInteractions } from '~/composables/dataset/interactions'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/edit-own-lines'>()

provideDatasetStore(route.params.id, undefined, true)

const cols = useStringsArraySearchParam('cols')
const display = useStringSearchParam('display', 'table')
const q = useStringSearchParam('q')
const sort = useStringSearchParam('sort')
// default "1" so that an absent param stays distinguishable from a legacy empty "?interaction="
const interaction = useStringSearchParam('interaction', '1')
const interactions = computed(() => parseInteractions(interaction.value))
</script>
