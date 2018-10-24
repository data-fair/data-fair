<template>
  <v-layout v-if="remoteService" column class="remoteService">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/remote-service/${remoteService.id}/description`">
        Description
        <v-icon>toc</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/remote-service/${remoteService.id}/config`">
        Configuration
        <v-icon>build</v-icon>
      </v-tab>
      <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/remote-service/${remoteService.id}/permissions`">
        Permissions
        <v-icon>security</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readApiDoc')" :nuxt="true" :to="`/remote-service/${remoteService.id}/api`">
        API
        <v-icon>cloud</v-icon>
      </v-tab>
    </v-tabs>

    <nuxt-child />

    <div class="actions-buttons">
      <v-menu bottom left>
        <v-btn slot="activator" fab small color="accent">
          <v-icon>more_vert</v-icon>
        </v-btn>
        <v-list>

          <v-list-tile v-if="remoteService.apiDoc.externalDocs" :href="remoteService.apiDoc.externalDocs.url" target="_blank">
            <v-list-tile-avatar>
              <v-icon>description</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Documentation externe</v-list-tile-title>
          </v-list-tile>

          <v-list-tile :disabled="!can('updateApiDoc')" @click="refresh">
            <v-list-tile-avatar>
              <v-icon color="accent">refresh</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Mettre a jour la description de l'API</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="can('delete')" @click="showDeleteDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">delete</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Supprimer</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>
    </div>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-card-title primary-title>
          Suppression de la configuration du service
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert :value="nbApplications === 1" type="error" outline>
            Attention ! Ce service est utilisé par une application. Si vous le supprimez cette application ne sera plus fonctionnelle.
          </v-alert>
          <v-alert :value="nbApplications > 1" type="error" outline>
            Attention ! Ce service est utilisé par {{ nbApplications }} applications. Si vous le supprimez ces applications ne seront plus fonctionnelles.
          </v-alert>
        </v-card-text>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration du service "{{ remoteService.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDeleteDialog = false">Non</v-btn>
          <v-btn color="warning" @click="confirmRemove">Oui</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    showDeleteDialog: false
  }),
  computed: {
    ...mapState('remoteService', ['remoteService', 'api', 'nbApplications']),
    ...mapGetters('remoteService', ['resourceUrl', 'can'])
  },
  mounted() {
    this.setId(this.$route.params.id)
    this.fetchVocabulary()
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions(['fetchVocabulary']),
    ...mapActions('remoteService', ['setId', 'patch', 'remove', 'clear', 'refresh']),
    async confirmRemove() {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({ path: '/remote-services' })
    }
  }
}
</script>

<style>
</style>
