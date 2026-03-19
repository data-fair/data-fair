<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    max-width="300"
  >
    <template #activator="{ props }">
      <v-btn
        color="primary"
        icon
        size="large"
        :title="t('downloadTitle')"
        v-bind="props"
      >
        <v-icon :icon="mdiDownload" />
      </v-btn>
    </template>
    <dataset-download-results
      :base-url="baseUrl"
      :selected-cols="selectedCols"
      :total="total"
      @download="menu = false"
    />
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  downloadTitle: Télécharger les résultats
en:
  downloadTitle: Download results
</i18n>

<script setup lang="ts">
import { mdiDownload } from '@mdi/js'

const { baseUrl, selectedCols, total } = defineProps({
  baseUrl: { type: String, required: true },
  selectedCols: { type: Array as () => String[], required: true },
  total: { type: Number, required: true }
})

const { t } = useI18n()

const menu = ref(false)

</script>

<style lang="css" scoped>
</style>
