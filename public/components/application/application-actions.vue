<template>
  <v-list
    v-if="application"
    dense
    class="list-actions"
  >
    <v-subheader v-t="'actions'" />
    <v-list-item
      :disabled="!can('readConfig')"
      :href="applicationLink"
      target="_blank"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-exit-to-app
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'fullPage'" />
    </v-list-item>

    <v-list-item
      v-if="can('writeConfig')"
      :to="'/application/' + application.id + '/config'"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-square-edit-outline
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'editConfig'" />
    </v-list-item>

    <v-list-item
      v-if="can('writeConfig')"
      @click="showIntegrationDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-code-tags
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'integrate'" />
    </v-list-item>

    <v-list-item
      v-for="link in publicationSitesLinks"
      :key="link.url"
      :href="link.url"
      target="_blank"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-open-in-new
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="{path: 'viewSite', args: {title: link.title}}" />
      </v-list-item-content>
    </v-list-item>

    <application-capture-dialog v-if="can('writeConfig')">
      <template #activator="{on, attrs}">
        <v-list-item
          v-bind="attrs"
          v-on="on"
        >
          <v-list-item-icon>
            <v-icon color="primary">
              mdi-camera
            </v-icon>
          </v-list-item-icon>
          <v-list-item-title v-t="'capture'" />
        </v-list-item>
      </template>
    </application-capture-dialog>

    <v-list-item
      v-if="can('readApiDoc')"
      @click="showAPIDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-cloud
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="'useAPI'" />
      </v-list-item-content>
    </v-list-item>

    <v-list-item
      v-if="can('delete')"
      @click="showDeleteDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-delete
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'delete'" />
    </v-list-item>

    <v-list-item
      v-if="can('delete')"
      @click="showOwnerDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-account
        </v-icon>
      </v-list-item-icon>
      <v-list-item-title v-t="'changeOwner'" />
    </v-list-item>

    <application-integration-dialog
      :show="showIntegrationDialog"
      @hide="showIntegrationDialog = false"
    />

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title
          v-t="'deleteApp'"
          primary-title
        />
        <v-card-text v-t="{path: 'deleteMsg', args: {title: application.title}}" />
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'no'"
            text
            @click="showDeleteDialog = false"
          />
          <v-btn
            v-t="'yes'"
            color="warning"
            @click="confirmRemove"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showOwnerDialog"
      max-width="900"
    >
      <v-card outlined>
        <v-card-title
          v-t="'changeOwnerTitle'"
          primary-title
        />
        <v-card-text>
          <owner-pick
            v-model="newOwner"
            :current-owner="application.owner"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'cancel'"
            text
            @click="showOwnerDialog = false"
          />
          <v-btn
            v-t="'confirm'"
            :disabled="!newOwner"
            color="warning"
            @click="changeOwner(newOwner); showOwnerDialog = false;"
          />
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
  actions: ACTIONS
  fullPage: Ouvrir en pleine page
  integrate: Intégrer dans un site
  viewSite: Voir sur {title}
  capture: Effectuer une capture
  useAPI: Utiliser l'API
  delete: Supprimer
  changeOwner: Changer le propriétaire
  deleteApp: Suppression de l'application
  deleteMsg: Voulez vous vraiment supprimer l'application "{title}" ? La suppression est définitive et la configuration de l'application ne pourra pas être récupérées.
  yes: Oui
  no: Non
  changeOwnerTitle: Changer le propriétaire de l'application
  cancel: Annuler
  confirm: Confirmer
  editConfig: Éditer la configuration
en:
  actions: ACTIONS
  fullPage: Open in a fullscreen
  integrate: Integrate in a website
  viewSite: See on {title}
  capture: Create a screenshot
  useAPI: Use the API
  delete: Delete
  changeOwner: Change owner
  deleteApp: Deletion of the application
  deleteMsg: Do you really want to delete the application "{title}" ? Deletion is definitive and application configuration will not be recoverable.
  yes: Yes
  no: No
  changeOwnerTitle: Change the owner of the application
  cancel: Cancel
  confirm: Confirm
  editConfig: Edit configuration
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  props: {
    publicationSites: {
      type: Array,
      default: () => []
    }
  },
  data: () => ({
    showDeleteDialog: false,
    showIntegrationDialog: false,
    showOwnerDialog: false,
    showAPIDialog: false,
    newOwner: null
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application', 'api']),
    ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink']),
    publicationSitesLinks () {
      if (!this.application.publicationSites) return []
      return this.application.publicationSites.map(dps => {
        const site = this.publicationSites.find(site => dps === `${site.type}:${site.id}`)
        if (!(site && site.applicationUrlTemplate)) return null
        return {
          url: site.applicationUrlTemplate.replace('{id}', this.application.id).replace('{slug}', this.application.slug),
          title: site.title || (site.url && site.url.replace('http://', '').replace('https://', '')) || site.id
        }
      }).filter(ps => !!ps)
    }
  },
  methods: {
    ...mapActions('application', ['setId', 'patch', 'remove', 'clear', 'changeOwner', 'subscribe']),
    async confirmRemove () {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({ path: '/applications' })
    }
  }
}
</script>

<style>
</style>
