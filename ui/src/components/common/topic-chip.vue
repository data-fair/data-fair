<template>
  <v-chip
    :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
    size="small"
    density="compact"
    variant="flat"
  >
    {{ topic.title }}
  </v-chip>
</template>

<script setup lang="ts">
defineProps<{
  topic: { id?: string, title: string, color?: string | null }
}>()
</script>
