<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step :complete="currentStep > 1" step="1">
        Choix du propriétaire
      </v-stepper-step>
      <v-divider />
      <v-stepper-step :complete="!!title" step="2" editable>
        Paramètres
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p class="mt-3">
          Un jeu de données virtuel est une représentation alternative de un ou plusieurs autres jeux de données.
          Vous pouvez les utiliser pour créer des vues limitées d'un jeu de données en appliquant des filtres ou en choisissant une partie seulement des colonnes.
          Vous pouvez également agréger plusieurs jeux de données en une seule représentation.
        </p>
        <owner-pick v-model="owner" />
        <v-btn :disabled="!owner" color="primary" @click.native="currentStep = 2">
          Continuer
        </v-btn>
        <v-btn flat @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
      <v-stepper-content step="2">
        <div class="mt-3 mb-3">
          <v-text-field
            v-model="title"
            :required="true"
            name="title"
            label="Titre"
          />
          <v-autocomplete
            v-model="children"
            :items="datasets"
            :loading="loadingDatasets"
            :search-input.sync="search"
            hide-no-data
            item-text="title"
            item-value="id"
            label="Jeux enfants"
            placeholder="Recherchez"
            multiple
          />
        </div>
        <v-btn :disabled="!title" color="primary" @click.native="createDataset()">
          Créer
        </v-btn>
        <v-btn flat @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
import { mapState } from 'vuex'
import eventBus from '../event-bus'
import OwnerPick from './OwnerPick.vue'

export default {
  components: { OwnerPick },
  data: () => ({
    currentStep: null,
    owner: null,
    title: '',
    children: [],
    loadingDatasets: false,
    search: '',
    datasets: []
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  watch: {
    search() {
      this.searchDatasets()
    },
    'owner.id'() {
      this.searchDatasets()
    }
  },
  methods: {
    async searchDatasets() {
      this.loadingDatasets = true
      const res = await this.$axios.$get('api/v1/datasets', {
        params: { q: this.search, size: 20, select: 'id,title', status: 'finalized', owner: `${this.owner.type}:${this.owner.id}` }
      })
      this.datasets = res.results
      this.loadingDatasets = false
    },
    async createDataset() {
      const options = {
        headers: { 'x-organizationId': 'user' }
      }
      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      try {
        const dataset = await this.$axios.$post('api/v1/datasets', { isVirtual: true, title: this.title, virtual: { children: this.children } }, options)
        this.$router.push({ path: `/dataset/${dataset.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la création du jeu de données virtual :' })
      }
    }
  }
}
</script>
