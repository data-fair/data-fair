<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="!!catalog.type" step="1" editable>Sélection du catalogue</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="!!catalog.apiKey" step="2" editable>Configuration</v-stepper-step>
      <v-divider/>
      <v-stepper-step :complete="currentStep > 2" step="3">Choix du propriétaire</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableCatalogs"
          v-model="catalogUrl"
          item-value="href"
          item-text="title"
          label="Choisissez un catalogue à configurer"
          @input="initFromUrl"
        />
        <v-text-field
          v-model="catalogUrl"
          label="Ou saisissez une URL d'un autre catalogue"
          @blur="initFromUrl"
          @keyup.native.enter="initFromUrl"
        />
        <v-text-field
          :disabled="!catalog.type"
          v-model="catalog.title"
          label="Titre"
        />
        <v-btn :disabled="!catalog.type" color="primary" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>

      <v-stepper-content step="2">
        <catalog-config-form :catalog="catalog"/>
        <v-btn :disabled="!catalog.apiKey" color="primary" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>

      <v-stepper-content step="3">
        <owner-pick v-model="owner"/>
        <v-btn :disabled="!owner" color="primary" @click.native="importCatalog()">Enregistrer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import marked from 'marked'
import { mapState } from 'vuex'
import eventBus from '../event-bus'
import CatalogConfigForm from './CatalogConfigForm.vue'
import OwnerPick from './OwnerPick.vue'

export default {
  components: { CatalogConfigForm, OwnerPick },
  props: ['initCatalog'],
  data: () => ({
    currentStep: null,
    owner: null,
    catalogUrl: null,
    configurableCatalogs: [],
    marked,
    catalog: {},
    importing: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  async mounted() {
    this.configurableCatalogs = await this.$axios.$get('api/v1/configurable-catalogs')
    if (this.initCatalog) {
      this.catalogUrl = this.initCatalog
      this.initFromUrl()
    }
  },
  methods: {
    async initFromUrl() {
      this.catalog = {}
      if (!this.catalogUrl) return
      try {
        this.catalog = await this.$axios.$post('api/v1/catalogs/_init', null, { params: { url: this.catalogUrl } })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des informations du catalogue` })
      }
    },
    async importCatalog() {
      const options = { headers: { 'x-organizationId': 'user' } }
      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      this.importing = true
      try {
        const catalog = await this.$axios.$post('api/v1/catalogs', this.catalog, options)
        this.$router.push({ path: `/catalog/${catalog.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant l'import de la description du catalogue` })
        this.importing = false
      }
    }
  }
}
</script>
