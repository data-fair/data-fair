<template>
  <v-col>
    <p class="mt-3">
      Un jeu de données incrémental est créé vide sans fichier de données et sans schéma. C'est vous qui allez éditer son schéma et éditer ses lignes de données par la suite.
    </p>
    <v-form ref="form" v-model="valid">
      <v-text-field
        v-model="title"
        :required="true"
        :rules="[value => !!(value.trim()) || 'le titre est obligatoire, il sea utilisé pour créer un identifiant au nouveau jeu de données']"
        name="title"
        label="Titre"
        style="max-width: 500px;"
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
    </v-form>

    <v-btn
      color="primary"
      class="mt-4"
      @click.native="validate"
    >
      Créer
    </v-btn>
  </v-col>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      valid: false,
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
      async validate() {
        if (!this.$refs.form.validate()) return
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
