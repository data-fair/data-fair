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
          {{ t('apiKeyUseDetails1') }} "<strong><code>x-apiKey</code></strong>"
          {{ t('apiKeyUseDetails2') }}
        </p>
        <p>
          {{ t('apiKeyUseDetails3') }}&nbsp;:
        </p>
        <code>curl -v -H "x-apiKey: {{ apiKey.clearKey || 'XXX' }}" {{ $apiPath }}/{{ apiKey.scopes[0] }}</code>
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
  apiKeyUseDetails1: Vous pouvez utiliser la clé d'API pour travailler avec l'API de ce service et avec l'API indépendante de chaque jeu de données auquel vous avez accès. Il suffit de passer le header
  apiKeyUseDetails2: dans votre client HTTP.
  apiKeyUseDetails3: Par exemple
en:
  use: Use
  apiKeyUse: API key usage
  apiKeyUseDetails1: You can use an API key to work with the global API and the API of each dataset you can access to. You have to provide the header
  apiKeyUseDetails2: in you HTTP client.
  apiKeyUseDetails3: For instance
</i18n>

<script lang="ts" setup>

const { t } = useI18n()
const menu = ref(false)

const { apiKey } = defineProps<{
  apiKey: {
    clearKey?: string
    scopes: string[]
  }
}>()
</script>
