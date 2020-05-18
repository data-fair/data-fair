<template>
  <v-row v-if="application" class="application">
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
          <v-list-item-title>{{ application.title || application.id }}</v-list-item-title>
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
          :to="`/application/${application.id}/description`"
        >
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title>Description</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readConfig')"
          :nuxt="true"
          :to="`/application/${application.id}/config`"
        >
          <v-list-item-action><v-icon>build</v-icon></v-list-item-action>
          <v-list-item-title>Configuration</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/application/${application.id}/permissions`"
        >
          <v-list-item-action><v-icon>security</v-icon></v-list-item-action>
          <v-list-item-title>Permissions</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/application/${application.id}/publications`"
        >
          <v-list-item-action><v-icon>publish</v-icon></v-list-item-action>
          <v-list-item-title>Publications</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readJournal')"
          :nuxt="true"
          :to="`/application/${application.id}/journal`"
        >
          <v-list-item-action><v-icon>mdi-calendar-text</v-icon></v-list-item-action>
          <v-list-item-title>Journal</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readApiDoc')"
          :nuxt="true"
          :to="`/application/${application.id}/api`"
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
            :disabled="!can('readConfig')"
            :href="applicationLink"
            target="_blank"
          >
            <v-list-item-avatar>
              <v-icon color="accent">
                exit_to_app
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Accéder à l'application</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="can('writeConfig')"
            @click="showIntegrationDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="primary">
                code
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Intégrer dans un site</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="can('writeConfig')"
            @click="showCaptureDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="primary">
                photo
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Effectuer une capture</v-list-item-title>
          </v-list-item>

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

    <v-dialog v-model="showIntegrationDialog">
      <v-card>
        <v-toolbar
          dense
          flat
        >
          <v-toolbar-title>Intégrer dans un site</v-toolbar-title>
          <v-spacer />
          <v-btn
            icon
            @click.native="showIntegrationDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="showIntegrationDialog">
          Pour intégrer cette application dans un site vous pouvez copier le code suivant ou un code similaire dans le contenu HTML de votre site.
          <br>
          <pre>
&lt;iframe src="{{ applicationLink }}?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"/&gt;
          </pre>
          <br>
          Résultat:
          <iframe
            :src="applicationLink + '?embed=true'"
            width="100%"
            height="500px"
            style="background-color: transparent; border: none;"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showCaptureDialog"
      max-width="500"
    >
      <v-card>
        <v-toolbar
          dense
          flat
        >
          <v-toolbar-title>Effectuer une capture</v-toolbar-title>
          <v-spacer />
          <v-btn
            icon
            @click.native="showCaptureDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="showCaptureDialog">
          <p>Une image statique au format PNG va être créée à partir de cette configuration d'application.</p>
          <v-text-field
            v-model="captureWidth"
            label="Largeur"
            type="number"
          />
          <v-text-field
            v-model="captureHeight"
            label="Hauteur"
            type="number"
          />
          <br>
          <a
            :href="`${env.captureUrl}/api/v1/screenshot?target=${encodeURIComponent(applicationLink)}&width=${captureWidth}&height=${captureHeight}`"
            download
          >Télécharger la capture</a>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title primary-title>
          Suppression de la configuration de l'application
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration de l'application "{{ application.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
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
          Changer le propriétaire de l'application
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
  import OwnerPick from '~/components/OwnerPick.vue'

  export default {
    components: { OwnerPick },
    data: () => ({
      showDeleteDialog: false,
      showIntegrationDialog: false,
      showCaptureDialog: false,
      showOwnerDialog: false,
      newOwner: null,
      captureWidth: 800,
      captureHeight: 450,
      mini: false,
    }),
    computed: {
      ...mapState(['env']),
      ...mapState('application', ['application', 'api']),
      ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink']),
    },
    mounted() {
      this.setId(this.$route.params.id)
      this.subscribe()
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions(['fetchVocabulary']),
      ...mapActions('application', ['setId', 'patch', 'remove', 'clear', 'changeOwner', 'subscribe']),
      async confirmRemove() {
        this.showDeleteDialog = false
        await this.remove()
        this.$router.push({ path: '/applications' })
      },
    },
  }
</script>

<style>
</style>
