<template>
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
  </div>
</template>

<script>
  import { mapState, mapActions } from 'vuex'

  export default {
    data: () => ({
      showDeleteDialog: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState('remoteService', ['remoteService']),
    },
    methods: {
      ...mapActions('remoteService', ['remove', 'refresh']),
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
