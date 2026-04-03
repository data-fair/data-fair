<template>
  <draggable
    :model-value="columns"
    :disabled="!sortable"
    item-key="key"
    ghost-class="column-ghost"
    class="d-flex flex-wrap ga-1"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #item="{ element }">
      <v-btn
        :key="element.key"
        style="text-transform: none;"
        class="px-2"
        size="small"
        :class="{ 'font-weight-bold': !!element['x-refersTo'] }"
        :color="activeColumnKey === element.key ? 'primary' : 'default'"
        :variant="activeColumnKey === element.key ? 'flat' : 'text'"
        :ripple="!sortable"
        @click="switchColumn(element.key)"
      >
        <v-icon
          size="small"
          start
        >
          {{ propTypeIcon(element) }}
        </v-icon>
        {{ element.title || element['x-originalName'] || element.key }}
      </v-btn>
    </template>
  </draggable>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import draggable from 'vuedraggable'
import type { SchemaProperty } from '#api/types'
import { propTypeIcon } from '~/utils/dataset'

const props = defineProps<{
  columns: SchemaProperty[]
  sortable?: boolean
  activeColumnKey?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any[]]
  'update:activeColumnKey': [key: string | null]
}>()

function switchColumn (key: string) {
  if (props.activeColumnKey === key) {
    emit('update:activeColumnKey', null)
  } else {
    emit('update:activeColumnKey', null)
    nextTick(() => {
      emit('update:activeColumnKey', key)
    })
  }
}
</script>

<style>
.column-ghost {
  opacity: 0.5;
  background-color: rgb(var(--v-theme-primary), 0.2) !important;
}
</style>
