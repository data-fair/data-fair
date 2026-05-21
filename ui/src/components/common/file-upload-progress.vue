<template>
  <div class="d-flex align-center">
    <v-progress-linear
      :model-value="percent"
      class="flex-grow-1"
      color="primary"
      height="6"
      rounded
    />
    <span
      v-if="percent !== undefined"
      class="text-caption text-medium-emphasis ml-2 text-no-wrap"
    >
      <template v-if="total">
        {{ Math.floor(percent) }}% — {{ formatBytes(total, locale) }}
      </template>
      <template v-else>
        {{ Math.floor(percent) }}%
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'

defineProps<{
  percent?: number
  total?: number
}>()

const { locale } = useI18n()
</script>
