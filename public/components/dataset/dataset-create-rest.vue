<template>
  <v-col>
    <p v-t="'message'" class="mt-3" />
    <v-form ref="form" v-model="valid">
      <v-text-field
        v-model="title"
        :required="true"
        :rules="[value => !!(value.trim()) || $t('requiredTitle')]"
        name="title"
        :label="$t('title')"
        style="max-width: 500px;"
      />
      <v-checkbox
        v-model="rest.history"
        hide-details
        :label="$t('history')"
      />
      <v-checkbox
        v-model="attachments"
        hide-details
        :label="$t('attachments')"
      />
      <v-checkbox
        v-model="attachmentsAsImage"
        hide-details
        :label="$t('attachmentsAsImage')"
      />
    </v-form>

    <v-btn
      v-t="'create'"
      color="primary"
      class="mt-4"
      @click.native="validate"
    />
  </v-col>
</template>

<i18n lang="yaml">
fr:
  message: Un jeu de données incrémental est créé vide sans fichier de données et sans schéma. C'est vous qui allez éditer son schéma et éditer ses lignes de données par la suite.
  title: Titre
  requiredTitle: le titre est obligatoire, il sea utilisé pour créer un identifiant au nouveau jeu de données
  create: Créer
  creationError: "Erreur pendant la création du jeu de données :"
  attachment: Pièce jointe
  history: Conserver un historique complet des révisions des lignes du jeu de données
  attachments: Accepter des pièces jointes
  attachmentsAsImage: Traiter les pièces jointes comme des images
en:
  message: An incremental dataset is created empty without data file or schema. You will edit the schema and the data lines afterward.
  title: Title
  requiredTitle: the title is required, it will be used to create an id for the new dataset
  create: Create
  creationError: "Error while creating the dataset:"
  attachment: Attachment
  history: Keep a full history of the revisions of the lines of the dataset
  attachments: Accept attachments
  attachmentsAsImage: Process the attachments as images
</i18n>

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
          if (this.attachments) schema.push({ key: 'attachmentPath', type: 'string', title: this.$t('attachment'), 'x-refersTo': 'http://schema.org/DigitalDocument' })
          const dataset = await this.$axios.$post('api/v1/datasets', { isRest: true, title: this.title, rest: this.rest, schema, attachmentsAsImage: this.attachmentsAsImage })
          this.$router.push({ path: `/dataset/${dataset.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        }
      },
    },
  }
</script>
