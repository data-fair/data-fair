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
      v-model:fixed="fixed"
      v-model:selected-item="selectedItem"
      :height="windowHeight"
      :interactions="interactions"
      :pagination="pagination"
      :selectable="selectable"
    />
  </v-container>
</template>

<script setup lang="ts">
// exemple avec volumétrie, historique DPE:
// https://koumoul.com/data-fair/embed/dataset/rr6wq5gxjqpm-89iyna6n4dz/table

import { useWindowSize } from '@vueuse/core'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import { parseInteractions } from '~/composables/dataset/interactions'
import { localizeSchema } from '~/composables/dataset/metadata-i18n'

const { height: windowHeight } = useWindowSize()

const route = useRoute<'/embed/dataset/[id]/table'>()
const draft = useBooleanSearchParam('draft')

const { dataset } = provideDatasetStore(route.params.id, draft.value ?? undefined, true)

// MOCKUP i18n: the schema texts in the user's locale, applied once per load, outside the table's hot path
const { locale } = useI18n()
watch(() => dataset.value?.schema, (schema) => {
  if (!schema) return
  localizeSchema(schema, locale.value)
  const title = dataset.value?.['x-i18n-title']?.[locale.value]
  if (title) dataset.value!.title = title
}, { immediate: true })

const cols = useStringsArraySearchParam('cols')
const display = useStringSearchParam('display', 'table')
const q = useStringSearchParam('q')
const sort = useStringSearchParam('sort')
const fixed = useStringSearchParam('fixed')
// which interactive elements are active, cf parseInteractions: absent/"1" for all, "0" for none,
// "count,search" for a subset, "-filters" for all but a subset
// default "1" so that an absent param stays distinguishable from a legacy empty "?interaction="
const interaction = useStringSearchParam('interaction', '1')
const interactions = computed(() => parseInteractions(interaction.value))
// pages instead of infinite scroll, more reliable in an iframe of constrained height
const pagination = useBooleanSearchParam('pagination', false)
const selectable = useBooleanSearchParam('selectable', false)
const selectedItem = useStringSearchParam('_id_eq')
</script>
