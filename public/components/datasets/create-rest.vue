<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="currentStep > 1"
        step="1"
      >
        Choix du propriétaire
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :complete="!!title"
        step="2"
        editable
      >
        Paramètres
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p class="mt-3">
          Un jeu de données incrémental est créé vide sans fichier de données et sans schéma. C'est vous qui allez éditer son schéma et éditer ses lignes de données par la suite.
        </p>
        <v-btn
          color="primary"
          @click.native="currentStep = 2"
        >
          Continuer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
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
            hide-details
            :label="`Conserver un historique complet des révisions des lignes du jeu de données`"
          />
          <v-checkbox
            v-model="attachments"
            hide-details
            :label="`Accepter des pièces jointes`"
          />
          <v-checkbox
            v-model="attachmentsAsImage"
            hide-details
            :label="`Traiter les pièces jointes comme des images`"
          />
        </div>
        <v-btn
          :disabled="!title"
          color="primary"
          @click.native="createDataset()"
        >
          Créer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      currentStep: null,
      title: '',
      rest: {
        history: false,
      },
      attachments: false,
      attachmentsAsImage: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
    },
    methods: {
      async createDataset() {
        try {
          const schema = []
          if (this.attachments) schema.push({ key: 'attachmentPath', type: 'string', title: 'Pièce jointe', 'x-refersTo': 'http://schema.org/DigitalDocument' })
          const dataset = await this.$axios.$post('api/v1/datasets', { isRest: true, title: this.title, rest: this.rest, schema, attachmentsAsImage: this.attachmentsAsImage })
          this.$router.push({ path: `/dataset/${dataset.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la création du jeu de données incrémental :' })
        }
      },
    },
  }
</script>
