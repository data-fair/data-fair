<template>
  <v-layout column class="remoteService" v-if="remoteService">
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
      <div style="height:56px;"/>
      <v-menu bottom left>
        <v-btn fab small slot="activator" color="accent">
          <v-icon>more_vert</v-icon>
        </v-btn>
        <v-list>

          <v-list-tile :href="remoteService.apiDoc.externalDocs.url" v-if="remoteService.apiDoc.externalDocs" target="_blank">
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
          Suppression de la configuration de service distant
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration de service distant "{{ remoteService.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
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
import {mapState, mapActions, mapGetters} from 'vuex'

export default {
  data: () => ({
    showDeleteDialog: false
  }),
  computed: {
    ...mapState('remoteService', ['remoteService', 'api']),
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
      this.$router.push({path: '/remote-services'})
    }
  }
}
</script>

<style>
</style>
