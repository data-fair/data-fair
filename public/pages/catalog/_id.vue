<template>
  <v-layout column class="catalog" v-if="catalog">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/catalog/${catalog.id}/config`">
        Configuration
        <v-icon>build</v-icon>
      </v-tab>
      <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/catalog/${catalog.id}/permissions`">
        Permissions
        <v-icon>security</v-icon>
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
          Suppression de la configuration du catalogue
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
          Voulez vous vraiment supprimer la configuration du service "{{ catalog.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
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
    ...mapState('catalog', ['catalog', 'api', 'nbApplications']),
    ...mapGetters('catalog', ['resourceUrl', 'can'])
  },
  mounted() {
    this.setId(this.$route.params.id)
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions('catalog', ['setId', 'patch', 'remove', 'clear']),
    async confirmRemove() {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({path: '/catalogs'})
    }
  }
}
</script>

<style>
</style>
