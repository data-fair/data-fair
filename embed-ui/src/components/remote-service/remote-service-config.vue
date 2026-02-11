<template>
  <v-container
    v-if="remoteService"
    fluid
  >
    <v-select
      v-model="remoteService.server"
      :items="remoteService.apiDoc?.servers"
      item-value="url"
      item-title="description"
      :label="t('server')"
    />

    <v-text-field
      v-if="remoteService.apiKey"
      v-model="remoteService.apiKey.value"
      :label="t('apiKey')"
    />

    <!-- Read only, updating can cause problems and confusion.
    For example the POST _default_services will crash because it will create duplicates -->
    <v-text-field
      v-model="remoteService.url"
      :disabled="true"
      :label="t('url')"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  server: Serveur
  apiKey: Clé d'API
  url: URL de mise à jour
en:
  server: Server
  apiKey: API key
  url: Update URL
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'

const remoteService = defineModel<RemoteService>()

const { t } = useI18n()
</script>
