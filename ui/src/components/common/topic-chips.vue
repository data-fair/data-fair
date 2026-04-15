<template>
  <div
    v-if="topics?.length"
    class="d-flex flex-wrap ga-1"
  >
    <topic-chip
      v-for="topic in topics"
      :key="topic.id ?? topic.title"
      :topic="topic"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  topics?: { id?: string, title: string, color?: string | null }[]
}>()
</script>
