<template>
  <v-row v-if="dataset" class="dataset">
    <v-navigation-drawer
      app
      fixed
      stateless
      :permanent="mini || $vuetify.breakpoint.lgAndUp"
      :temporary="!mini && !$vuetify.breakpoint.lgAndUp"
      :mini-variant="mini"
      :value="true"
    >
      <v-list dense class="pt-0">
        <v-list-item
          v-if="mini"
          style="min-height: 64px"
          @click.stop="mini = false"
        >
          <v-list-item-action>
            <v-icon>mdi-chevron-right</v-icon>
          </v-list-item-action>
        </v-list-item>
        <v-list-item v-else style="min-height: 64px">
          <v-list-item-title class="title">
            {{ dataset.title || dataset.id }}
          </v-list-item-title>
          <v-list-item-action style="min-width: 0;">
            <v-btn icon @click.stop="mini = true">
              <v-icon>mdi-chevron-left</v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>

        <v-list-item
          :disabled="!can('readDescription')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/description`"
        >
          <v-list-item-action><v-icon>mdi-information</v-icon></v-list-item-action>
          <v-list-item-title>Description</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readDescription')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/attachments`"
        >
          <v-list-item-action><v-icon>mdi-attachment</v-icon></v-list-item-action>
          <v-list-item-title>Pièces jointes</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('writeDescription') && dataset.isVirtual"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/virtual`"
        >
          <v-list-item-action><v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon></v-list-item-action>
          <v-list-item-title>Jeu virtuel</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readLines')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/tabular`"
        >
          <v-list-item-action><v-icon>mdi-view-list</v-icon></v-list-item-action>
          <v-list-item-title>Vue tableau</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate')"
          :disabled="!can('readLines')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/calendar`"
        >
          <v-list-item-action><v-icon>mdi-calendar-range</v-icon></v-list-item-action>
          <v-list-item-title>Calendrier</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="dataset.bbox"
          :disabled="!can('readLines')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/map`"
        >
          <v-list-item-action><v-icon>mdi-map</v-icon></v-list-item-action>
          <v-list-item-title>Carte</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="fileProperty"
          :disabled="!can('readLines')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/search-files`"
        >
          <v-list-item-action><v-icon>mdi-content-copy</v-icon></v-list-item-action>
          <v-list-item-title>Fichiers</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')"
          :disabled="!can('readLines')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/thumbnails`"
        >
          <v-list-item-action><v-icon>mdi-image</v-icon></v-list-item-action>
          <v-list-item-title>Vignettes</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/permissions`"
        >
          <v-list-item-action><v-icon>mdi-security</v-icon></v-list-item-action>
          <v-list-item-title>Permissions</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="!dataset.isVirtual"
          :disabled="!can('writeDescription')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/extend`"
        >
          <v-list-item-action><v-icon>mdi-merge</v-icon></v-list-item-action>
          <v-list-item-title>Enrichissement</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="can('getPermissions')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/publications`"
        >
          <v-list-item-action><v-icon>mdi-publish</v-icon></v-list-item-action>
          <v-list-item-title>Publications</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readJournal')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/journal`"
        >
          <v-list-item-action><v-icon>mdi-calendar-text</v-icon></v-list-item-action>
          <v-list-item-title>Journal</v-list-item-title>
        </v-list-item>
        <v-list-item
          :disabled="!can('readApiDoc')"
          :nuxt="true"
          :to="`/dataset/${dataset.id}/api`"
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
      <v-menu bottom left>
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
            v-if="!dataset.isRest && !dataset.isVirtual"
            :disabled="!can('downloadOriginalData')"
            :href="downloadLink"
          >
            <v-list-item-avatar>
              <v-icon color="primary">
                mdi-file-download
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Fichier d'origine</v-list-item-title>
          </v-list-item>
          <v-list-item
            :href="downloadFullLink"
            :disabled="!can('downloadFullData') || (!dataset.isRest && (!dataset.extensions || !dataset.extensions.find(e => e.active)))"
          >
            <v-list-item-avatar>
              <v-icon color="primary">
                mdi-download-multiple
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Fichier enrichi</v-list-item-title>
          </v-list-item>
          <v-list-item
            v-if="can('writeData')"
            @click="showUploadDialog = true"
          >
            <v-list-item-avatar>
              <v-icon color="warning">
                mdi-file-upload
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Remplacer</v-list-item-title>
          </v-list-item>
          <v-list-item v-if="can('delete')" @click="showDeleteDialog = true">
            <v-list-item-avatar>
              <v-icon color="warning">
                mdi-delete
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-title>Supprimer</v-list-item-title>
          </v-list-item>
          <v-list-item v-if="can('delete')" @click="showOwnerDialog = true">
            <v-list-item-avatar>
              <v-icon color="warning">
                mdi-account
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
          Suppression du jeu de données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            :value="nbApplications === 1"
            type="error"
            outline
          >
            Attention ! Ce jeu de données est utilisé par une application. Si vous le supprimez cette application ne sera plus fonctionnelle.
          </v-alert>
          <v-alert
            :value="nbApplications > 1"
            type="error"
            outline
          >
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} applications. Si vous le supprimez ces applications ne seront plus fonctionnelles.
          </v-alert>
        </v-card-text>
        <v-card-text>
          Voulez vous vraiment supprimer le jeu de données "{{ dataset.title }}" ? La suppression est définitive et les données ne pourront pas être récupérées.
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

    <v-dialog
      v-model="showOwnerDialog"
      max-width="900"
    >
      <v-card>
        <v-card-title primary-title>
          Changer le propriétaire du jeu de données
        </v-card-title>
        <v-card-text>
          <owner-pick v-model="newOwner" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showOwnerDialog = false">
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

    <v-dialog
      v-model="showUploadDialog"
      max-width="500"
    >
      <v-card>
        <v-card-title primary-title>
          Remplacement des données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            :value="nbApplications === 1"
            type="error"
            outline
          >
            Attention ! Ce jeu de données est utilisé par une application. Si vous modifiez sa structure l'application peut ne plus fonctionner.
          </v-alert>
          <v-alert
            :value="nbApplications > 1"
            type="error"
            outline
          >
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} applications. Si vous modifiez sa structure ces applications peuvent ne plus fonctionner.
          </v-alert>
        </v-card-text>
        <v-card-text>
          <input
            type="file"
            @change="onFileUpload"
          >
          <v-progress-linear
            v-if="uploading"
            v-model="uploadProgress"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showUploadDialog = false">
            Annuler
          </v-btn>
          <v-btn
            :disabled="!file || uploading"
            color="warning"
            @click="confirmUpload"
          >
            Charger
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  import OwnerPick from '~/components/OwnerPick.vue'
  import eventBus from '~/event-bus'

  export default {
    components: { OwnerPick },
    async fetch({ store, params, route }) {
      await store.dispatch('dataset/setId', route.params.id)
      await store.dispatch('fetchVocabulary')
    },
    data: () => ({
      showDeleteDialog: false,
      showUploadDialog: false,
      showOwnerDialog: false,
      file: null,
      uploading: false,
      uploadProgress: 0,
      newOwner: null,
      mini: false,
    }),
    computed: {
      ...mapState('dataset', ['dataset', 'api', 'nbApplications']),
      ...mapGetters('dataset', ['resourceUrl', 'can']),
      fileProperty() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      downloadLink() {
        return this.dataset ? this.resourceUrl + '/raw' : null
      },
      downloadFullLink() {
        return this.dataset ? this.resourceUrl + '/full' : null
      },
    },
    mounted() {
      this.subscribe()
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('dataset', ['patch', 'remove', 'clear', 'changeOwner', 'subscribe']),
      async confirmRemove() {
        this.showDeleteDialog = false
        await this.remove()
        this.$router.push({ path: '/datasets' })
      },
      onFileUpload(e) {
        this.file = e.target.files[0]
      },
      async confirmUpload() {
        const options = {
          onUploadProgress: (e) => {
            if (e.lengthComputable) {
              this.uploadProgress = (e.loaded / e.total) * 100
            }
          },
        }
        const formData = new FormData()
        formData.append('file', this.file)

        this.uploading = true
        try {
          await this.$axios.$put('api/v1/datasets/' + this.dataset.id, formData, options)
          this.showUploadDialog = false
        } catch (error) {
          const status = error.response && error.response.status
          if (status === 413) {
            eventBus.$emit('notification', { type: 'error', msg: 'Le fichier est trop volumineux pour être importé' })
          } else if (status === 429) {
            eventBus.$emit('notification', { type: 'error', msg: 'Le propriétaire sélectionné n\'a pas assez d\'espace disponible pour ce fichier' })
          } else {
            eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import du fichier:' })
          }
        }
        this.uploading = false
      },
    },
  }
</script>

<style>
</style>
