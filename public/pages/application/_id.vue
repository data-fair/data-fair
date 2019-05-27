<template>
  <v-layout v-if="application" column class="application">
    <v-navigation-drawer app fixed stateless :permanent="mini || $vuetify.breakpoint.lgAndUp" :temporary="!mini && !$vuetify.breakpoint.lgAndUp" :mini-variant="mini" :value="true">
      <v-list dense>
        <v-list-tile v-if="mini" @click.stop="mini = false">
          <v-list-tile-action>
            <v-icon>chevron_right</v-icon>
          </v-list-tile-action>
        </v-list-tile>
        <v-list-tile v-else avatar>
          <v-list-tile-title>{{ application.title || application.id }}</v-list-tile-title>
          <v-list-tile-action style="min-width: 0;">
            <v-btn icon @click.stop="mini = true">
              <v-icon>chevron_left</v-icon>
            </v-btn>
          </v-list-tile-action>
        </v-list-tile>

        <v-list-tile :disabled="!can('readDescription')" :nuxt="true" :to="`/application/${application.id}/description`">
          <v-list-tile-action><v-icon>info</v-icon></v-list-tile-action>
          <v-list-tile-title>Description</v-list-tile-title>
        </v-list-tile>
        <v-list-tile :disabled="!can('readConfig')" :nuxt="true" :to="`/application/${application.id}/config`">
          <v-list-tile-action><v-icon>build</v-icon></v-list-tile-action>
          <v-list-tile-title>Configuration</v-list-tile-title>
        </v-list-tile>
        <v-list-tile v-if="can('getPermissions')" :nuxt="true" :to="`/application/${application.id}/permissions`">
          <v-list-tile-action><v-icon>security</v-icon></v-list-tile-action>
          <v-list-tile-title>Permissions</v-list-tile-title>
        </v-list-tile>
        <v-list-tile v-if="can('getPermissions')" :nuxt="true" :to="`/application/${application.id}/publications`">
          <v-list-tile-action><v-icon>publish</v-icon></v-list-tile-action>
          <v-list-tile-title>Publications</v-list-tile-title>
        </v-list-tile>
        <v-list-tile :disabled="!can('readJournal')" :nuxt="true" :to="`/application/${application.id}/journal`">
          <v-list-tile-action><v-icon>event_note</v-icon></v-list-tile-action>
          <v-list-tile-title>Journal</v-list-tile-title>
        </v-list-tile>
        <v-list-tile :disabled="!can('readApiDoc')" :nuxt="true" :to="`/application/${application.id}/api`">
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
          <v-list-tile :disabled="!can('readConfig')" :href="applicationLink" target="_blank">
            <v-list-tile-avatar>
              <v-icon color="accent">
                exit_to_app
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Accéder à l'application</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="can('writeConfig')" @click="showIntegrationDialog = true">
            <v-list-tile-avatar>
              <v-icon color="primary">
                code
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Intégrer dans un site</v-list-tile-title>
          </v-list-tile>

          <v-list-tile v-if="can('writeConfig')" @click="showCaptureDialog = true">
            <v-list-tile-avatar>
              <v-icon color="primary">
                photo
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Effectuer une capture</v-list-tile-title>
          </v-list-tile>

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

    <v-dialog v-model="showIntegrationDialog">
      <v-card>
        <v-toolbar dense flat>
          <v-toolbar-title>Intégrer dans un site</v-toolbar-title>
          <v-spacer />
          <v-btn icon @click.native="showIntegrationDialog = false">
            <v-icon>close</v-icon>
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
          <iframe :src="applicationLink + '?embed=true'" width="100%" height="500px" style="background-color: transparent; border: none;" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showCaptureDialog" max-width="500">
      <v-card>
        <v-toolbar dense flat>
          <v-toolbar-title>Effectuer une capture</v-toolbar-title>
          <v-spacer />
          <v-btn icon @click.native="showCaptureDialog = false">
            <v-icon>close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="showCaptureDialog">
          <p>Une image statique au format PNG va être créée à partir de cette configuration d'application.</p>
          <v-text-field v-model="captureWidth" label="Largeur" type="number" />
          <v-text-field v-model="captureHeight" label="Hauteur" type="number" />
          <br>
          <a :href="`${env.captureUrl}/api/v1/screenshot?target=${encodeURIComponent(applicationLink)}&width=${captureWidth}&height=${captureHeight}`" download>Télécharger la capture</a>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-card-title primary-title>
          Suppression de la configuration de l'application
        </v-card-title>
        <v-card-text>
          Voulez vous vraiment supprimer la configuration de l'application "{{ application.title }}" ? La suppression est définitive et le paramétrage ne pourra pas être récupéré.
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
          Changer le propriétaire de l'application
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
    showIntegrationDialog: false,
    showCaptureDialog: false,
    showOwnerDialog: false,
    newOwner: null,
    captureWidth: 800,
    captureHeight: 450,
    mini: false
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application', 'api']),
    ...mapGetters('application', ['resourceUrl', 'can', 'applicationLink'])
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
    }
  }
}
</script>

<style>
</style>
