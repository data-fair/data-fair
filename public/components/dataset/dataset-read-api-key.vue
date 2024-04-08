<template>
  <v-container fluid>
    <p>
      Permettez à vos utilisateurs d'utiliser l'API de ce jeu de données en dehors d'une session.
      Cette fonctionnalité est utile par exemple pour consommer les données dans Excel.
    </p>
    <v-alert
      type="warning"
      outlined
    >
      Cette fonctionnalité baisse la sécurisation de l'accès à ce jeu de données. Évitez de l'utiliser sur les données les plus sensibles.
      Si vous pensez que la clé a trop circulé vous pouvez désactiver et re-activer l'accès pour forcer le renouvellement.
    </v-alert>
    <v-form ref="form">
      <lazy-v-jsf
        v-if="editReadApiKey"
        v-model="editReadApiKey"
        :schema="schema"
        :options="{ locale: 'fr', disableAll: !can('setReadApiKey')}"
      >
        <template #singleSearchs-before />
      </lazy-v-jsf>
      <template v-if="actualReadApiKey?.current">
        <p>Clé: {{ actualReadApiKey.current }} (expirera le {{ $d(new Date(dataset.readApiKey.expiresAt)) }})</p>
        <p>Exemple d'utilisation : <a :href="exampleUrl">{{ exampleUrl }}</a></p>
      </template>
      <v-row class="px-2 mt-4">
        <v-spacer />
        <v-btn
          v-t="'save'"
          color="primary"
          :disabled="!hasChanges"
          @click="validate"
        />
      </v-row>
    </v-form>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  save: Enregistrer
en:
  save: Save
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
const datasetSchema = require('~/../contract/dataset.js')

const defaultReadApiKey = { active: false, interval: 'P1M' }

export default {
  data () {
    return {
      editReadApiKey: null,
      actualReadApiKey: null
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    schema () {
      return JSON.parse(JSON.stringify(datasetSchema.properties.readApiKey))
    },
    hasChanges () {
      return JSON.stringify(this.dataset.readApiKey || defaultReadApiKey) !== JSON.stringify(this.editReadApiKey)
    },
    exampleUrl () {
      return `${this.resourceUrl}/lines?apiKey=${this.actualReadApiKey?.current}`
    }
  },
  watch: {
    'dataset.readApiKey': {
      handler () {
        this.editReadApiKey = JSON.parse(JSON.stringify(this.dataset.readApiKey || defaultReadApiKey))
        if (this.dataset.readApiKey?.active) this.fetchReadApiKey()
        else this.actualReadApiKey = null
      },
      immediate: true
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndApplyRemoteChange']),
    validate () {
      const valid = this.$refs.form.validate()
      if (valid) this.patchAndApplyRemoteChange({ readApiKey: this.editReadApiKey })
    },
    async fetchReadApiKey () {
      this.actualReadApiKey = await this.$axios.$get(`${this.resourceUrl}/read-api-key`)
    }
  }
}
</script>

<style lang="css" scoped>
</style>
