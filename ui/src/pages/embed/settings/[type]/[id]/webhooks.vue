<template>
  <v-container
    data-iframe-height
  >
    <settings-webhooks
      v-if="settings"
      v-model="settings.webhooks"
      @update:model-value="settingsEditFetch.save.execute()"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  saved: Les paramètres ont été mis à jour
en:
  saved: Settings have been updated
</i18n>

<script setup lang="ts">
import { useEditFetch } from '@data-fair/lib-vue/edit-fetch.js'
import type { Settings } from '#api/types'

const { t } = useI18n()
const route = useRoute<'/embed/settings/[type]/[id]/webhooks'>()
const settingsEditFetch = useEditFetch<Settings>(
  () => `${$apiPath}/settings/${route.params.type}/${route.params.id}`,
  { patch: true, saveOptions: { success: t('saved') } }
)
const settings = settingsEditFetch.data
</script>
