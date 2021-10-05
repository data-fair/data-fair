<template>
  <v-list
    v-if="catalog"
    dense
    class="list-actions"
  >
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

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title v-t="'deleteTitle'" primary-title />
        <v-card-text v-if="nbPublications > 0">
          <v-alert
            v-t="{path: 'deleteWarning', args: {count:nbPublications}}"
            :value="nbPublications > 1"
            type="error"
            outlined
          />
        </v-card-text>
        <v-card-text v-t="{path: 'deleteConfirm', args: {title: catalog.title}}" />
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
      outlined
    >
      <v-card>
        <v-card-title v-t="'changeOwnerTitle'" primary-title />
        <v-card-text>
          <owner-pick v-model="newOwner" />
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
  </v-list>
</template>

<i18n lang="yaml">
fr:
  delete: Supprimer
  changeOwner: Changer de propriétaire
  changeOwnerTitle: Changer le propriétaire du catalogue
  cancel: Annuler
  confirm: Confirmer
  deleteTitle: Suppression de la configuration du catalogue
  deleteWarning: " | Attention ! Ce catalogue est référencé dans 1 lien de publication. Si vous le supprimez ce lien sera invalide. | Attention ! Ce catalogue est référencé dans {count} liens de publication. Si vous le supprimez ces liens seront invalides."
  deleteConfirm: Voulez vous vraiment supprimer la configuration du catalogue "{title}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
  no: Non
  yes: Oui
en:
  delete: Delete
  changeOwner: Change owner
  changeOwnerTitle: Change the owner of the catalog
  cancel: Cancel
  confirm: Confirm
  deleteTitle: Delete the catalog's configuraiton
  deleteWarning: " | Warning ! This catalog is referenced in 1 publication link. If you delete it the link will be broken. | Warning ! This catalog is referenced in {count} publication links. If you delete it the links will be broken."
  deleteConfirm: Do you really want to delete the catalog configuration "{title}" ? Deletion is definitive and the configuration will not be recoverable.
  no: No
  yes: Yes
</i18n>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'

  export default {
    data: () => ({
      showDeleteDialog: false,
      showOwnerDialog: false,
      newOwner: null,
    }),
    computed: {
      ...mapState('catalog', ['catalog', 'nbPublications']),
      ...mapGetters('catalog', ['can']),
    },
    methods: {
      ...mapActions('catalog', ['patch', 'remove', 'changeOwner']),
      async confirmRemove() {
        this.showDeleteDialog = false
        await this.remove()
        this.$router.push({ path: '/catalogs' })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
