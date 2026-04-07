<!-- eslint-disable vue/no-v-html -->
<template>
  <v-dialog
    v-model="show"
    max-width="800"
    :scrim="false"
  >
    <v-card
      :loading="fetchFullValue.loading.value"
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
