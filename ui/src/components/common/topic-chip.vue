<template>
  <v-chip
    :prepend-icon="topic.icon?.svgPath"
    :color="topic.color"
    :text="topic.title"
    size="small"
    density="compact"
    variant="flat"
  />
</template>

<script setup lang="ts">
import type { Topic } from '#api/types'

defineProps<{ topic: Topic }>()
</script>
