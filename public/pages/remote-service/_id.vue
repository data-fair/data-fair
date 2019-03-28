<template>
  <v-layout v-if="remoteService" column class="remoteService">
    <v-navigation-drawer app fixed stateless :permanent="mini || $vuetify.breakpoint.lgAndUp" :temporary="!mini && !$vuetify.breakpoint.lgAndUp" :mini-variant="mini" :value="true">
      <v-list dense>
        <v-list-tile v-if="mini" @click.stop="mini = false">
          <v-list-tile-action>
            <v-icon>chevron_right</v-icon>
          </v-list-tile-action>
        </v-list-tile>
        <v-list-tile v-else avatar>
          <v-list-tile-title>{{ remoteService.title || remoteService.id }}</v-list-tile-title>
          <v-list-tile-action style="min-width: 0;">
            <v-btn icon @click.stop="mini = true">
              <v-icon>chevron_left</v-icon>
            </v-btn>
          </v-list-tile-action>
        </v-list-tile>

        <v-list-tile :nuxt="true" :to="`/remote-service/${remoteService.id}/description`">
          <v-list-tile-action><v-icon>info</v-icon></v-list-tile-action>
          <v-list-tile-title>Description</v-list-tile-title>
        </v-list-tile>
        <v-list-tile v-id="user.isAdmin" :nuxt="true" :to="`/remote-service/${remoteService.id}/config`">
          <v-list-tile-action><v-icon>build</v-icon></v-list-tile-action>
          <v-list-tile-title>Configuration</v-list-tile-title>
        </v-list-tile>
        <v-list-tile :nuxt="true" :to="`/remote-service/${remoteService.id}/api`">
          <v-list-tile-action><v-icon>cloud</v-icon></v-list-tile-action>
          <v-list-tile-title>API</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>

    <v-layout row>
      <nuxt-child />
    </v-layout>

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

          <v-list-tile v-if="user.isAdmin" @click="refresh">
            <v-list-tile-avatar>
              <v-icon color="accent">
                refresh
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Mettre a jour la description de l'API</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="user.isAdmin" @click="showDeleteDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">
                delete
              </v-icon>
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
        <v-card-text>
          Voulez vous vraiment supprimer la configuration du service "{{ remoteService.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn flat @click="showDeleteDialog = false">
            Non
          </v-btn>
          <v-btn color="warning" @click="confirmRemove">
            Oui
          </v-btn>
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
    ...mapState('session', ['user']),
    ...mapState('remoteService', ['remoteService', 'api']),
    ...mapGetters('remoteService', ['resourceUrl'])
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
