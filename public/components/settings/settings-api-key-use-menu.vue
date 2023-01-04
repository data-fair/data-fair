<template>
  <v-menu
    v-model="menu"
    max-width="700px"
    min-width="500px"
    :close-on-content-click="false"
  >
    <template #activator="{on, attrs}">
      <v-btn
        color="primary"
        text
        class="pa-0 ma-0"
        v-bind="attrs"
        small
        v-on="on"
      >
        {{ $t('use') }}
      </v-btn>
    </template>
    <v-card
      v-if="menu"
      outlined
      data-iframe-height
    >
      <v-card-title primary-title>
        {{ $t('apiKeyUse') }}
      </v-card-title>
      <v-card-text>
        <p>
          {{ $t('apiKeyUseDetails1') }}
        </p><p>
          {{ $t('apiKeyUseDetails2') }}&nbsp;:
        </p>
        <pre style="white-space: pre-wrap;">
          <code>curl -v -H "x-apiKey: {{ apiKey.clearKey || 'XXX' }}" {{ env.publicUrl }}/api/v1/{{ apiKey.scopes[0] }}</code>
        </pre>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          text
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
  apiKeyUseDetails1: Vous pouvez utiliser la clé d'API pour travailler avec l'API de ce service et avec l'API indépendante de chaque jeu de données auquel vous avez accès.
  apiKeyUseDetails2: Il suffit de passer le header "x-apiKey" dans votre client HTTP. Par exemple
en:
  use: Use
  apiKeyUse: API key usage
  apiKeyUseDetails1: You can use an API key to work with the global API and the API of each dataset you can access to.
  apiKeyUseDetails2: You have to provide the header "x-apiKey" in you HTTP client. For instance
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    apiKey: { type: Object, required: true }
  },
  data () {
    return { menu: false }
  },
  computed: {
    ...mapState(['env'])
  }
}
</script>

<style>

</style>
