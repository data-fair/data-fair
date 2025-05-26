<!-- eslint-disable vue/no-v-html -->
<template lang="html">
  <v-dialog
    :model-value="show"
    max-width="700"
    :scrim="false"
  >
    <v-card
      :loading="fetchFullValue.loading.value"
    >
      <v-toolbar
        dense
        flat
        color="transparent"
      >
        <v-spacer />
        <v-btn
          icon
          @click="show = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text v-if="!fetchFullValue.loading">
        <div
          v-if="property['x-display'] === 'textarea'"
          class="item-value-detail item-value-detail-textarea"
        >
          {{ fullValue }}
        </div>
        <div
          v-else-if="(property['x-display'] === 'markdown' || property['x-refersTo'] === 'http://schema.org/description') && !!fullValue"
          class="item-value-detail"
          v-html="fullValue"
        />
        <span v-else>{{ fullValue }}</span>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { type SchemaProperty } from '#api/types'
import type { ExtendedResult } from '../../composables/dataset-lines'

const { extendedResult, property } = defineProps({
  extendedResult: { type: Object as () => ExtendedResult, required: true },
  property: { type: Object as () => SchemaProperty, required: true }
})

const show = defineModel<boolean>({ default: false })
watch(show, () => {
  if (show.value) fetchFullValue.refresh()
})

const { id } = useDatasetStore()

const fetchFullValue = useFetch<{ results: any[] }>(`${$apiPath}/datasets/${id}/lines`, {
  query: computed(() => ({
    qs: `_id:"${extendedResult._id}"`,
    select: property.key,
    html: true
  })),
  immediate: false
})
const fullValue = computed(() => fetchFullValue.data.value?.results[0]?.[property.key])
</script>

<style>
.v-chip-group.dense-value .v-slide-group__content {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.item-value-color-pin {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-block;
  position: absolute;
  top: 8px;
  left: 2px;
  border: 2px solid #ccc;
}
.item-value-detail-textarea {
  white-space: pre-line;
  overflow-wrap: break-word;
}
.item-value-detail p:last-child {
  margin-bottom: 0;
}
</style>
