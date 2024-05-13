<template>
  <v-list
    v-if="remoteService"
    dense
    class="list-actions"
  >
    <v-list-item
      v-if="remoteService.apiDoc.externalDocs"
      :href="remoteService.apiDoc.externalDocs.url"
      target="_blank"
    >
      <v-list-item-icon>
        <v-icon>mdi-information</v-icon>
      </v-list-item-icon>
      <v-list-item-title>{{ $t('externalDoc') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      @click="showAPIDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-cloud
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>{{ $t('useAPI') }}</v-list-item-title>
      </v-list-item-content>
    </v-list-item>

    <v-list-item
      v-if="user.adminMode"
      color="admin"
      @click="refresh"
    >
      <v-list-item-icon>
        <v-icon color="admin">
          mdi-refresh
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>{{ $t('updateAPI') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="user.adminMode"
      color="admin"
      @click="showDeleteDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="admin">
          mdi-delete
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title>{{ $t('delete') }}</v-list-item-title>
    </v-list-item>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title primary-title>
          {{ $t('deleteTitle') }}
        </v-card-title>
        <v-card-text>
          {{ $t('deleteMsg', {title: remoteService.title}) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            text
            @click="showDeleteDialog = false"
          >
            {{ $t('no') }}
          </v-btn>
          <v-btn
            color="warning"
            @click="confirmRemove"
          >
            {{ $t('yes') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showAPIDialog"
      fullscreen
    >
      <v-card outlined>
        <v-toolbar
          dense
          flat
          color="transparent"
        >
          <v-toolbar-title />
          <v-spacer />
          <v-btn
            icon
            @click.native="showAPIDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="showAPIDialog">
          <open-api
            v-if="resourceUrl"
            :url="resourceUrl + '/api-docs.json'"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  externalDoc: Documentation externe
  useAPI: Utiliser l'API
  updateAPI: Mettre a jour la description de l'API
  delete: Supprimer
  deleteTitle: Suppression de la configuration du service
  deleteMsg: Voulez vous vraiment supprimer la configuration du service "{title}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
  yes: Oui
  no: Non
en:
  externalDoc: External documentation
  useAPI: Use API
  updateAPI: Update API description
  delete: Delete
  deleteTitle: Delete the service configuration
  deleteMsg: Do you really want to delete the service configuration "{title}" ? Deletion is definitive.
  yes: Yes
  no: No
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    showDeleteDialog: false,
    showAPIDialog: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState('remoteService', ['remoteService']),
    ...mapGetters('remoteService', ['resourceUrl'])
  },
  methods: {
    ...mapActions('remoteService', ['remove', 'refresh']),
    async confirmRemove () {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({ path: '/remote-services' })
    }
  }
}
</script>

<style>
</style>
