<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step step="1" :complete="!!catalog.type" editable>Sélection du catalogue</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="2" :complete="!!catalog.apiKey" editable>Configuration</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="3" :complete="currentStep > 2">Choix du propriétaire</v-stepper-step>
      <v-divider/>
      <v-stepper-step step="4">Effectuer l'action</v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-select
          :items="configurableCatalogs"
          item-value="href"
          item-text="title"
          v-model="catalogUrl"
          label="Choisissez un catalogue à configurer"
          @input="initFromUrl"
        />
        <v-text-field
          label="Ou saisissez une URL d'un autre catalogue"
          v-model="catalogUrl"
          @blur="initFromUrl"
          @keyup.native.enter="initFromUrl"
        />
        <v-text-field
          :disabled="!catalog.type"
          label="Titre"
          v-model="catalog.title"
        />
        <v-btn color="primary" :disabled="!catalog.type" @click.native="currentStep = 2">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>

      <v-stepper-content step="2">
        <catalog-config-form :catalog="catalog"/>
        <v-btn color="primary" :disabled="!catalog.apiKey" @click.native="currentStep = 3">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>

      <v-stepper-content step="3">
        <owner-pick v-model="owner"/>
        <v-btn color="primary" :disabled="!owner" @click.native="currentStep = 4">Continuer</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>

      <v-stepper-content step="4">
        <v-progress-linear v-model="uploadProgress"/>
        <v-btn color="primary" @click.native="importCatalog()">Lancer l'import</v-btn>
        <v-btn flat @click.native="$emit('cancel')">Annuler</v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import marked from 'marked'
import {mapState} from 'vuex'
import eventBus from '../event-bus'
import CatalogConfigForm from './CatalogConfigForm.vue'
import OwnerPick from './OwnerPick.vue'

export default {
  components: {CatalogConfigForm, OwnerPick},
  props: ['initCatalog'],
  data: () => ({
    currentStep: null,
    owner: null,
    uploadProgress: 0,
    catalogUrl: null,
    configurableCatalogs: [],
    marked,
    catalog: {}
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
        this.catalog = await this.$axios.$post('api/v1/catalogs/_init', null, {params: {url: this.catalogUrl}})
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la récupération des informations du catalogue`})
      }
    },
    async importCatalog() {
      const options = {headers: {'x-organizationId': 'user'}}
      if (this.owner.type === 'organization') {
        options.headers = {'x-organizationId': this.owner.id}
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      try {
        const catalog = await this.$axios.$post('api/v1/catalogs', this.catalog, options)
        this.$router.push({path: `/catalog/${catalog.id}/description`})
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant l'import de la description du catalogue`})
      }
    }
  }
}
</script>
