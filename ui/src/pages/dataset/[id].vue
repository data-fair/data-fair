<template>
  <dataset-page-shell
    :id="route.params.id"
    :key="route.params.id"
  />
</template>

<script setup lang="ts">
definePage({ alias: '/datasets/:id' })

const route = useRoute<'/dataset/[id]'>()
</script>
