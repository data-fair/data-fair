<template>
  <v-layout column class="application" v-if="application">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/application/${application.id}/description`">
        Description
        <v-icon>toc</v-icon>
      </v-tab>
      <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/application/${application.id}/permissions`">
        Permissions
        <v-icon>security</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readApiDoc')" :nuxt="true" :to="`/application/${application.id}/api`">
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
          <v-list-tile :disabled="!can('readConfig')" :href="applicationLink" target="_blank">
            <v-list-tile-avatar>
              <v-icon color="accent">exit_to_app</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Accéder à l'application</v-list-tile-title>
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
          Suppression de la configuration de l'application
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration de l'application "{{ application.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
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
    ...mapState(['env']),
    ...mapState('application', ['application', 'api']),
    ...mapGetters('application', ['resourceUrl', 'can']),
    applicationLink() {
      if (this.application) return this.env.publicUrl + '/app/' + this.application.id
    }
  },
  mounted() {
    this.setId(this.$route.params.id)
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions(['fetchVocabulary']),
    ...mapActions('application', ['setId', 'patch', 'remove', 'clear']),
    async confirmRemove() {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({path: '/applications'})
    }
  }
}
</script>

<style>
</style>
