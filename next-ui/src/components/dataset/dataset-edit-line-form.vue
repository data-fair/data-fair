<template>
  {{ jsonSchemaFetch.data }}
</template>

<script lang="ts" setup>
const { jsonSchemaFetch } = useDatasetStore()
</script>
