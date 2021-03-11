<template lang="html">
  <v-container fluid>
    <p>
      Créez un lien que vous pouvez communiquer aux personnes avec qui vous souhaitez partager cette application et qui ne sont pas authentifiés sur ce service.
    </p>

    <v-alert
      type="warning"
      :value="true"
      border="left"
      outlined
    >
      Attention ce lien donne accès à cette application et au contenu du jeu de données référencé dans sa configuration. Si vous craignez que ce lien ait trop circulé vous pouvez le supprimer, en créer un autre et communiquer ce nouveau lien aux bonnes personnes.
    </v-alert>

    <template v-if="applicationKeys">
      <template v-if="protectedLink">
        <p class="mb-0">
          Lien protégé : <a :href="protectedLink">{{ protectedLink }}</a>&nbsp;
          <confirm-menu
            v-if="can('setKeys')"
            yes-color="warning"
            text="Souhaitez-vous confirmer la suppression ?"
            tooltip="Supprimer ce lien"
            @confirm="deleteLink"
          />
        </p>
      </template>

      <v-btn
        v-else-if="can('setKeys')"
        color="primary"
        :disabled="loading"
        @click="addLink"
      >
        Créer un lien protégé
      </v-btn>
    </template>
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'

  export default {
    data() {
      return {
        applicationKeys: null,
        loading: false,
      }
    },
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application']),
      ...mapGetters('application', ['can', 'applicationLink']),
      protectedLink() {
        if (!this.applicationKeys || !this.applicationKeys.length) return
        return this.applicationLink + '?key=' + this.applicationKeys[0].id
      },
    },
    async created() {
      this.applicationKeys = await this.$axios.$get('api/v1/applications/' + this.application.id + '/keys')
    },
    methods: {
      async addLink() {
        this.loading = true
        this.applicationKeys = await this.$axios.$post('api/v1/applications/' + this.application.id + '/keys', this.applicationKeys.concat([{ title: 'Lien protégé' }]))
        this.loading = false
      },
      async deleteLink() {
        this.loading = true
        this.applicationKeys = await this.$axios.$post('api/v1/applications/' + this.application.id + '/keys', [])
        this.loading = false
      },
    },
  }

</script>

<style lang="css">
</style>
