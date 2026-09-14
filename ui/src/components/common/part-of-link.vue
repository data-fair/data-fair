<template>
  <router-link :to="`/${partOf.type}/${partOf.id}`">
    {{ partOf.title ?? partOf.id }}
  </router-link>
</template>

<script setup lang="ts">
import type { ResourceRef } from '@data-fair/data-fair-shared/utils/parent-children.ts'

// the detail routes are the singular of the resource type, which is exactly what partOf.type holds
defineProps<{ partOf: ResourceRef & { title?: string } }>()
</script>
