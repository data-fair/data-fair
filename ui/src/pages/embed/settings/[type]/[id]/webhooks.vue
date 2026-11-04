<template>
  <v-container data-iframe-height>
    <settings-webhooks
      v-if="settings"
      v-model="settings.webhooks"
      v-model:valid="valid"
    />
    <div
      v-if="settingsEditFetch.hasDiff.value"
      class="d-flex justify-end mt-4"
    >
      <v-btn
        color="accent"
        variant="flat"
        :disabled="!valid"
        :loading="settingsEditFetch.save.loading.value"
        @click="settingsEditFetch.save.execute()"
      >
        {{ t('save') }}
      </v-btn>
    </div>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  save: Enregistrer
  saved: Les webhooks ont été mis à jour
en:
  save: Save
  saved: Webhooks have been updated
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
const valid = ref(true)
</script>
