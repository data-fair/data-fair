<template>
  <v-row v-if="catalog" class="catalog">
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
          @click.stop="mini = false"
        >
          <v-list-item-action>
            <v-icon>mdi-chevron-right</v-icon>
          </v-list-item-action>
        </v-list-item>
        <v-list-item
          v-else
          avatar
        >
          <v-list-item-title>{{ catalog.title || catalog.id }}</v-list-item-title>
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
          :disabled="!can('readDescription')"
          :nuxt="true"
          :to="`/catalog/${catalog.id}/description`"
        >
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title>Description</v-list-item-title>
        </v-list-item>
        <v-list-item
          :nuxt="true"
          :to="`/catalog/${catalog.id}/datasets`"
        >
          <v-list-item-action><v-icon>toc</v-icon></v-list-item-action>
          <v-list-item-title>Jeux de données</v-list-item-title>
        </v-list-item>
        <!-- <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/catalog/${catalog.id}/permissions`">
          Permissions
          <v-icon>security</v-icon>
        </v-tab>-->
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
        <v-btn
          slot="activator"
          fab
          small
          color="accent"
        >
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
        <v-list>
          <v-list-item
            v-if="can('delete')"
            @click="showDeleteDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="warning">
                delete
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Supprimer</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="can('delete')"
            @click="showOwnerDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="warning">
                person
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Changer de propriétaire</v-list-item-title>
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
          Suppression de la configuration du catalogue
        </v-card-title>
        <v-card-text v-if="nbPublications > 0">
          <v-alert
            :value="nbPublications === 1"
            type="error"
            outline
          >
            Attention ! Ce catalogue est référencé dans un lien de publication. Si vous le supprimez ce lien sera invalide.
          </v-alert>
          <v-alert
            :value="nbPublications > 1"
            type="error"
            outline
          >
            Attention ! Ce catalogue est référencé dans ${nbPublications} liens de publication. Si vous le supprimez ces liens seront invalides.
          </v-alert>
        </v-card-text>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration du catalogue "{{ catalog.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showDeleteDialog = false"
          >
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

    <v-dialog
      v-model="showOwnerDialog"
      max-width="900"
    >
      <v-card>
        <v-card-title primary-title>
          Changer le propriétaire du catalogue
        </v-card-title>
        <v-card-text>
          <owner-pick v-model="newOwner" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showOwnerDialog = false"
          >
            Annuler
          </v-btn>
          <v-btn
            :disabled="!newOwner"
            color="warning"
            @click="changeOwner(newOwner); showOwnerDialog = false;"
          >
            Confirmer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
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
      mini: false,
    }),
    computed: {
      ...mapState('catalog', ['catalog', 'api', 'nbPublications']),
      ...mapGetters('catalog', ['resourceUrl', 'can']),
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
      },
    },
  }
</script>

<style>
</style>
