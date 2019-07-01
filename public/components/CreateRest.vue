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
          Un jeu de données incrémental est créé vide sans fichier de données et sans schéma. C'est vous qui allez éditer son schéma et éditer ses lignes de données par la suite.
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
          <v-checkbox
            v-model="rest.history"
            :label="`Conserver un historique complet des révisions des lignes du jeu de données`"
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
    rest: {
      history: false
    }
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  methods: {
    async createDataset() {
      const options = {
        headers: { 'x-organizationId': 'user' }
      }
      if (this.owner.type === 'organization') {
        options.headers = { 'x-organizationId': this.owner.id }
        if (this.owner.role) options.headers['x-organizationRole'] = this.owner.role
      }
      try {
        const dataset = await this.$axios.$post('api/v1/datasets', { isRest: true, title: this.title, rest: this.rest }, options)
        this.$router.push({ path: `/dataset/${dataset.id}/description` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la création du jeu de données incrémental :` })
      }
    }
  }
}
</script>
