<template>
  <application-page-shell
    :id="route.params.id"
    :key="route.params.id"
  />
</template>

<script setup lang="ts">
definePage({ alias: '/applications/:id' })

const route = useRoute<'/application/[id]'>()
</script>
