<template lang="html">
  <v-container fluid>
    <p v-t="'message'" />

    <v-alert
      v-t="'warning'"
      type="warning"
      :value="true"
      border="left"
      outlined
    />

    <template v-if="applicationKeys">
      <template v-if="protectedLink">
        <p class="mb-0">
          {{ $t('protectedLink') }} <a :href="protectedLink">{{ protectedLink }}</a>&nbsp;
          <confirm-menu
            v-if="can('setKeys')"
            yes-color="warning"
            :text="$t('deleteText')"
            :tooltip="$t('delete')"
            @confirm="deleteLink"
          />
        </p>
      </template>

      <v-btn
        v-else-if="can('setKeys')"
        v-t="'createProtectedLink'"
        color="primary"
        :disabled="loading"
        @click="addLink"
      />
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  message: Créez un lien que pourrez pouvez communiquer aux personnes avec qui vous souhaitez partager cette application et qui ne sont pas authentifiés sur ce service.
  warning: Attention ! Ce lien donne accès à cette application et au contenu du jeu de données référencé dans sa configuration. Si vous craignez que ce lien ait trop circulé vous pouvez le supprimer, en créer un autre et communiquer ce nouveau lien aux bonnes personnes.
  protectedLink: "Lien protégé"
  delete: Supprimer ce lien
  deleteText: Souhaitez-vous confirmer la suppression ?
  createProtectedLink: Créer un lien protégé
en:
  message: Create a link that you will be able to share with the people to whom you want to give access to this application and who are not authenticated on this service.
  warning: Warning ! This link gives access to this application and to the content of the dataset used in its configuration. If you fear this link might have been to widely communicated you can delete it then create another one and communicate this new link to your users.
  protectedLink: "Protected link"
  delete: Delete this link
  deleteText: Do you really want to delete this link ?
  createProtectedLink: Create a protected link
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  data () {
    return {
      applicationKeys: null,
      loading: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application']),
    ...mapGetters('application', ['can', 'applicationLink']),
    protectedLink () {
      if (!this.applicationKeys || !this.applicationKeys.length) return
      return this.applicationLink + '?key=' + this.applicationKeys[0].id
    }
  },
  async created () {
    this.applicationKeys = await this.$axios.$get('api/v1/applications/' + this.application.id + '/keys')
  },
  methods: {
    async addLink () {
      this.loading = true
      this.applicationKeys = await this.$axios.$post('api/v1/applications/' + this.application.id + '/keys', this.applicationKeys.concat([{ title: this.$t('protectedLink') }]))
      this.loading = false
    },
    async deleteLink () {
      this.loading = true
      this.applicationKeys = await this.$axios.$post('api/v1/applications/' + this.application.id + '/keys', [])
      this.loading = false
    }
  }
}

</script>

<style lang="css">
</style>
