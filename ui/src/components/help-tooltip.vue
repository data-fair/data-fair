<template>
  <v-tooltip
    :location="location"
    :text="text"
    max-width="400"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :size="small ? 'small' : 'default'"
        :icon="mdiInformation"
        variant="text"
      />
    </template>
    <template
      v-if="$slots.default"
      #default
    >
      <slot />
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
import { mdiInformation } from '@mdi/js'

withDefaults(defineProps<{
  small?: boolean
  location?: 'top' | 'bottom' | 'start' | 'end' | 'left' | 'right'
  text?: string
}>(), {
  small: false,
  location: 'start',
})
</script>
