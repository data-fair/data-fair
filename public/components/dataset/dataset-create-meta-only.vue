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
  message: Un jeu de métadonnées seules est créé vide sans fichier de données et sans schéma.
  title: Titre
  requiredTitle: le titre est obligatoire, il sea utilisé pour créer un identifiant au nouveau jeu de données
  create: Créer
  creationError: "Erreur pendant la création du jeu de données virtual :"
en:
  message: A metadata-only dataset is created empty without data file or schema.
  title: Title
  requiredTitle: the title is required, it will be used to create an id for the new dataset
  create: Create
  creationError: "Error while creating the virtual dataset:"
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
          const dataset = await this.$axios.$post('api/v1/datasets', { isMetaOnly: true, title: this.title })
          this.$router.push({ path: `/dataset/${dataset.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        }
      },
    },
  }
</script>
