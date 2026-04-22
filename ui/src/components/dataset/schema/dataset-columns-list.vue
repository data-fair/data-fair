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
        class="px-2"
        density="compact"
        variant="flat"
        :class="{ 'font-weight-bold': !!element['x-refersTo'], 'font-weight-regular': !element['x-refersTo'], 'font-italic': !!element['x-extension'] }"
        :color="columnColor(element)"
        :ripple="!sortable"
        @click="switchColumn(element.key)"
      >
        <v-icon
          :icon="propTypeIcon(element)"
          size="small"
          start
        />
        {{ element.title || element['x-originalName'] || element.key }}
      </v-btn>
    </template>
  </draggable>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import draggable from 'vuedraggable'
import equal from 'fast-deep-equal'
import type { SchemaProperty } from '#api/types'
import { propTypeIcon } from '~/utils/dataset'

const props = defineProps<{
  columns: SchemaProperty[]
  originalSchema?: SchemaProperty[]
  sortable?: boolean
  activeColumnKey?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SchemaProperty[]]
  'update:activeColumnKey': [key: string | null]
}>()

function isModified (column: SchemaProperty): boolean {
  if (!props.originalSchema) return false
  const original = props.originalSchema.find(p => p.key === column.key)
  if (!original) return true
  return !equal(column, original)
}

function columnColor (column: SchemaProperty): string | undefined {
  if (props.activeColumnKey === column.key) return 'primary'
  if (isModified(column)) return 'accent'
  return undefined
}

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
