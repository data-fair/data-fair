<template>
  <v-layout v-if="catalog" column class="catalog">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/catalog/${catalog.id}/description`">
        Description
        <v-icon>toc</v-icon>
      </v-tab>
      <v-tab :nuxt="true" :to="`/catalog/${catalog.id}/datasets`">
        Jeux de données
        <v-icon>toc</v-icon>
      </v-tab>
      <!-- <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/catalog/${catalog.id}/permissions`">
        Permissions
        <v-icon>security</v-icon>
      </v-tab>-->
    </v-tabs>

    <nuxt-child />

    <div class="actions-buttons">
      <v-menu bottom left>
        <v-btn slot="activator" fab small color="accent">
          <v-icon>more_vert</v-icon>
        </v-btn>
        <v-list>

          <v-list-tile v-if="can('delete')" @click="showDeleteDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">delete</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Supprimer</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="can('delete')" @click="showOwnerDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">person</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Changer de propriétaire</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>
    </div>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-card-title primary-title>
          Suppression de la configuration du catalogue
        </v-card-title>
        <v-card-text v-if="nbPublications > 0">
          <v-alert :value="nbPublications === 1" type="error" outline>
            Attention ! Ce catalogue est référencé dans un lien de publication. Si vous le supprimez ce lien sera invalide.
          </v-alert>
          <v-alert :value="nbPublications > 1" type="error" outline>
            Attention ! Ce catalogue est référencé dans ${nbPublications} liens de publication. Si vous le supprimez ces liens seront invalides.
          </v-alert>
        </v-card-text>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration du catalogue "{{ catalog.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDeleteDialog = false">Non</v-btn>
          <v-btn color="warning" @click="confirmRemove">Oui</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showOwnerDialog" max-width="900">
      <v-card>
        <v-card-title primary-title>
          Changer le propriétaire du catalogue
        </v-card-title>
        <v-card-text>
          <owner-pick v-model="newOwner"/>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showOwnerDialog = false">Annuler</v-btn>
          <v-btn :disabled="!newOwner" color="warning" @click="changeOwner(newOwner); showOwnerDialog = false;">Confirmer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import OwnerPick from '../../components/OwnerPick.vue'

export default {
  components: { OwnerPick },
  data: () => ({
    showDeleteDialog: false,
    showOwnerDialog: false,
    newOwner: null
  }),
  computed: {
    ...mapState('catalog', ['catalog', 'api', 'nbPublications']),
    ...mapGetters('catalog', ['resourceUrl', 'can'])
  },
  mounted() {
    this.setId(this.$route.params.id)
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions('catalog', ['setId', 'patch', 'remove', 'clear', 'changeOwner']),
    async confirmRemove() {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({ path: '/catalogs' })
    }
  }
}
</script>

<style>
</style>
