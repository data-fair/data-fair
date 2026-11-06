<template>
  <v-btn-toggle
    v-model="viewMode"
    class="flex-shrink-0"
    density="compact"
    mandatory
  >
    <v-btn
      value="grid"
      :icon="mdiViewGrid"
      :title="t('grid')"
    />
    <v-btn
      value="list"
      :icon="mdiViewList"
      :title="t('list')"
    />
  </v-btn-toggle>
</template>

<i18n lang="yaml">
fr:
  grid: Vue en cartes
  list: Vue en liste
en:
  grid: Cards view
  list: List view
</i18n>

<script setup lang="ts">
import { mdiViewGrid, mdiViewList } from '@mdi/js'
import type { ViewMode } from '~/composables/use-view-mode'

const viewMode = defineModel<ViewMode>({ required: true })
const { t } = useI18n()
</script>
