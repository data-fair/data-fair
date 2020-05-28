<template>
  <v-row v-if="remoteService" class="remoteService">
    <v-navigation-drawer
      app
      fixed
      stateless
      :permanent="mini || $vuetify.breakpoint.lgAndUp"
      :temporary="!mini && !$vuetify.breakpoint.lgAndUp"
      :mini-variant="mini"
      :value="true"
    >
      <v-list dense>
        <v-list-item
          v-if="mini"
          style="min-height: 64px"
          @click.stop="mini = false"
        >
          <v-list-item-action>
            <v-icon>mdi-chevron-right</v-icon>
          </v-list-item-action>
        </v-list-item>
        <v-list-item
          v-else
          style="min-height: 64px"
        >
          <v-list-item-title>{{ remoteService.title || remoteService.id }}</v-list-item-title>
          <v-list-item-action style="min-width: 0;">
            <v-btn
              icon
              @click.stop="mini = true"
            >
              <v-icon>mdi-chevron-left</v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>

        <v-list-item
          :nuxt="true"
          :to="`/remote-service/${remoteService.id}/description`"
        >
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title>Description</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="user.adminMode"
          color="admin"
          :nuxt="true"
          :to="`/remote-service/${remoteService.id}/config`"
        >
          <v-list-item-action><v-icon>mdi-wrench</v-icon></v-list-item-action>
          <v-list-item-title>Configuration</v-list-item-title>
        </v-list-item>
        <v-list-item
          :nuxt="true"
          :to="`/remote-service/${remoteService.id}/api`"
        >
          <v-list-item-action><v-icon>mdi-cloud</v-icon></v-list-item-action>
          <v-list-item-title>API</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-col>
      <nuxt-child />
    </v-col>

    <div class="actions-buttons">
      <v-menu
        bottom
        left
      >
        <template v-slot:activator="{on}">
          <v-btn
            fab
            small
            color="accent"
            v-on="on"
          >
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item
            v-if="remoteService.apiDoc.externalDocs"
            :href="remoteService.apiDoc.externalDocs.url"
            target="_blank"
          >
            <v-list-item-avatar>
              <v-icon>mdi-information</v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Documentation externe</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="user.adminMode"
            color="admin"
            @click="refresh"
          >
            <v-list-item-avatar>
              <v-icon color="admin">
                mdi-refresh
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Mettre a jour la description de l'API</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="user.adminMode"
            color="admin"
            @click="showDeleteDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="admin">
                mdi-delete
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Supprimer</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title primary-title>
          Suppression de la configuration du service
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration du service "{{ remoteService.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showDeleteDialog = false">
            Non
          </v-btn>
          <v-btn
            color="warning"
            @click="confirmRemove"
          >
            Oui
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    data: () => ({
      showDeleteDialog: false,
      mini: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState('remoteService', ['remoteService', 'api']),
      ...mapGetters('remoteService', ['resourceUrl']),
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
      },
    },
  }
</script>

<style>
</style>
