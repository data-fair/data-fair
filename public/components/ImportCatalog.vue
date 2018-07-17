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
        <v-radio-group v-model="owner" class="mt-3 mb-3">
          <v-radio :label="key === 'user' ? 'Vous-même' : user.organizations.find(o => o.id === owners[key].id).name" :value="key" v-for="key in Object.keys(owners)" :key="key"/>
        </v-radio-group>
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

export default {
  components: {CatalogConfigForm},
  props: ['initCatalog'],
  data: () => ({
    currentStep: null,
    owner: 'user',
    uploadProgress: 0,
    catalogUrl: null,
    configurableCatalogs: [],
    marked,
    catalog: {}
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    owners() {
      return {
        user: {type: 'user', id: this.user.id, name: this.user.name},
        ...this.user.organizations.reduce((a, o) => {
          a['orga' + o.id] = {type: 'organization', id: o.id, name: o.name}
          return a
        }, {})
      }
    }
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
      try {
        const catalog = await this.$axios.$post('api/v1/catalogs', this.catalog)
        this.$router.push({path: `/catalog/${catalog.id}/description`})
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant l'import de la description du catalogue`})
      }
    }
  }
}
</script>
