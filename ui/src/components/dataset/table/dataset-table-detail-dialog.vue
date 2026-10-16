<!-- eslint-disable vue/no-v-html -->
<template>
  <v-dialog
    v-model="show"
    max-width="800"
    :scrim="false"
  >
    <!-- the focus moves into the dialog, or Enter and the arrows go on acting on the table
         behind it. Enter closes it like Escape (it opens on Enter from the table cell), except
         on a link or a button of the value -->
    <v-card
      ref="card"
      tabindex="-1"
      :loading="fetchFullValue.loading.value"
      @keydown.enter="(e: KeyboardEvent) => !(e.target as HTMLElement).closest('a, button, input, textarea') && (show = false)"
    >
      <v-toolbar
        density="compact"
        flat
      >
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="show = false"
        />
      </v-toolbar>
      <v-card-text v-if="!fetchFullValue.loading.value">
        <div
          v-if="(property['x-display'] === 'markdown' || property['x-refersTo'] === 'http://schema.org/description') && !!fullValue"
          class="item-value-detail"
          v-html="fullValue"
        />
        <div
          v-else-if="property['x-display'] === 'textarea'"
          class="item-value-detail item-value-detail-textarea"
        >
          {{ fullValue }}
        </div>
        <span v-else>{{ fullValue }}</span>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { type SchemaProperty } from '#api/types'
import type { ExtendedResult } from '../../../composables/dataset/lines'
import { mdiClose } from '@mdi/js'

const { extendedResult, property } = defineProps({
  extendedResult: { type: Object as () => ExtendedResult, required: true },
  property: { type: Object as () => SchemaProperty, required: true }
})

const show = defineModel<boolean>({ default: false })

// the table unmounts the dialog when it closes: give the focus back to the cell it opened
// from (its loupe button is gone by then, the table hides its buttons once it loses the focus)
const active = document.activeElement as HTMLElement | null
const opener = active?.closest<HTMLElement>('[data-row]') ?? active
const card = useTemplateRef('card')
// as soon as it renders, a key pressed during the opening transition would reach the table
watch(card, c => (c?.$el as HTMLElement | undefined)?.focus())
onUnmounted(() => opener?.focus())

const { id } = useDatasetStore()

const fetchFullValue = useFetch<{ results: any[] }>(`${$apiPath}/datasets/${id}/lines`, {
  query: computed(() => ({
    qs: `_id:"${extendedResult._id}"`,
    select: property.key,
    html: true
  }))
})
const fullValue = computed(() => fetchFullValue.data.value?.results[0]?.[property.key])
</script>

<style>
.item-value-detail-textarea {
  white-space: pre-line;
  overflow-wrap: break-word;
}
.item-value-detail p:last-child {
  margin-bottom: 0;
}
</style>
