<template>
  <v-layout v-if="catalog" column class="catalog">
    <v-navigation-drawer app fixed stateless :permanent="mini || $vuetify.breakpoint.lgAndUp" :temporary="!mini && !$vuetify.breakpoint.lgAndUp" :mini-variant="mini" :value="true">
      <v-list dense>
        <v-list-tile v-if="mini" @click.stop="mini = false">
          <v-list-tile-action>
            <v-icon>chevron_right</v-icon>
          </v-list-tile-action>
        </v-list-tile>
        <v-list-tile v-else avatar>
          <v-list-tile-title>{{ catalog.title || catalog.id }}</v-list-tile-title>
          <v-list-tile-action style="min-width: 0;">
            <v-btn icon @click.stop="mini = true">
              <v-icon>chevron_left</v-icon>
            </v-btn>
          </v-list-tile-action>
        </v-list-tile>

        <v-list-tile :disabled="!can('readDescription')" :nuxt="true" :to="`/catalog/${catalog.id}/description`">
          <v-list-tile-action><v-icon>info</v-icon></v-list-tile-action>
          <v-list-tile-title>Description</v-list-tile-title>
        </v-list-tile>
        <v-list-tile :nuxt="true" :to="`/catalog/${catalog.id}/datasets`">
          <v-list-tile-action><v-icon>toc</v-icon></v-list-tile-action>
          <v-list-tile-title>Jeux de données</v-list-tile-title>
        </v-list-tile>
        <!-- <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/catalog/${catalog.id}/permissions`">
          Permissions
          <v-icon>security</v-icon>
        </v-tab>-->
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
          <v-list-tile v-if="can('delete')" @click="showDeleteDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">
                delete
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Supprimer</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="can('delete')" @click="showOwnerDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">
                person
              </v-icon>
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

    <v-dialog v-model="showOwnerDialog" max-width="900">
      <v-card>
        <v-card-title primary-title>
          Changer le propriétaire du catalogue
        </v-card-title>
        <v-card-text>
          <owner-pick v-model="newOwner" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn flat @click="showOwnerDialog = false">
            Annuler
          </v-btn>
          <v-btn :disabled="!newOwner" color="warning" @click="changeOwner(newOwner); showOwnerDialog = false;">
            Confirmer
          </v-btn>
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
    newOwner: null,
    mini: false
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
