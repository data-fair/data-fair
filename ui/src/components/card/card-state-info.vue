<template>
  <!-- the "state" corner of a card: last run, import or publication status, errors -->
  <card-hover-info
    :title="title ?? text"
    :icon="icon"
    :icon-color="color"
    end
  >
    <v-progress-circular
      v-if="loading"
      indeterminate
      color="primary"
      size="16"
      width="2"
    />
    <v-icon
      v-else
      :icon="icon"
      :color="color"
      size="18"
    />
    <span
      v-if="text"
      class="font-weight-bold"
      :class="strong ? `text-${color}` : ''"
    >{{ text }}</span>
    <template #help>
      <slot>{{ help }}</slot>
    </template>
  </card-hover-info>
</template>

<script setup lang="ts">
import cardHoverInfo from './card-hover-info.vue'

defineProps<{ icon: string, color?: string, text?: string, title?: string, help?: string, strong?: boolean, loading?: boolean }>()
</script>
