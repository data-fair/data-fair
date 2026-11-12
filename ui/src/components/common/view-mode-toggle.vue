<template>
  <v-btn-toggle
    v-model="viewMode"
    class="flex-shrink-0"
    variant="outlined"
    color="primary"
    density="compact"
    divided
    mandatory
  >
    <v-btn
      value="grid"
      :prepend-icon="mdiViewGrid"
      class="text-none"
    >
      {{ t('grid') }}
    </v-btn>
    <v-btn
      value="list"
      :prepend-icon="mdiViewList"
      class="text-none"
    >
      {{ t('list') }}
    </v-btn>
  </v-btn-toggle>
</template>

<i18n lang="yaml">
fr:
  grid: Vignettes
  list: Liste
en:
  grid: Cards
  list: List
</i18n>

<script setup lang="ts">
import { mdiViewGrid, mdiViewList } from '@mdi/js'
import type { ViewMode } from '~/composables/use-view-mode'

const viewMode = defineModel<ViewMode>({ required: true })
const { t } = useI18n()
</script>
