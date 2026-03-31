<template>
  <v-menu
    v-model="menu"
    max-width="700px"
    min-width="500px"
    :close-on-content-click="false"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        color="primary"
        variant="text"
        size="small"
      >
        {{ t('use') }}
      </v-btn>
    </template>
    <v-card
      v-if="menu"
      variant="outlined"
      data-iframe-height
    >
      <v-card-title primary-title>
        {{ t('apiKeyUse') }}
      </v-card-title>
      <v-card-text>
        <p class="mb-2">
          {{ t('apiKeyUseDetails') }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          @click="menu = false"
        >
          Ok
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  use: Utiliser
  apiKeyUse: Utilisation d'une clé d'API
  apiKeyUseDetails: Vous pouvez vous référer aux documentations d'API et utiliser cette clé en passant sa valeur dans le header "x-apiKey".
en:
  use: Use
  apiKeyUse: API key usage
  apiKeyUseDetails: You can refer to the API documentation and use this key by passing its value in the "x-apiKey" header.
</i18n>

<script lang="ts" setup>

const { t } = useI18n()
const menu = ref(false)
</script>
