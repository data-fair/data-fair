<template>
  <v-container data-iframe-height>
    <settings-api-keys
      v-if="settings"
      v-model="settings.apiKeys"
      :restricted-scopes="scopes"
      :edit="apiKeysEdit"
      inline-form
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  saved: Les clés API ont été mises à jour
en:
  saved: API keys have been updated
</i18n>

<script setup lang="ts">
import { useEditFetch } from '~/composables/df-local/edit-fetch-local'
import type { Settings } from '#api/types'

const { t } = useI18n()
const route = useRoute<'/embed/settings/[type]/[id]/api-keys'>()
const settingsEditFetch = useEditFetch<Settings>(
  () => `${$apiPath}/settings/${route.params.type}/${route.params.id}`,
  { patch: true }
)
const settings = settingsEditFetch.data
const apiKeysEdit = settingsEditFetch.createSubEdit(['apiKeys'], { success: t('saved') })

const scopes = computed(() => {
  return (route.query.scopes && typeof route.query.scopes === 'string' && route.query.scopes.split(',')) || undefined
})
</script>
