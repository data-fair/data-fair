<template>
  <v-list
    v-if="dataset"
    dense
    class="list-actions"
  >
    <v-subheader v-if="dataFiles && dataFiles.length">
      TÉLÉCHARGEMENTS
    </v-subheader>
    <v-list-item
      v-for="dataFile in (dataFiles || [])"
      :key="dataFile.key"
      :disabled="!can('downloadFullData')"
      :href="dataFile.url"
      nav
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-file-download
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>{{ dataFile.title }}</v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-subheader>
      ACTIONS
    </v-subheader>
    <v-list-item
      v-if="can('writeData')"
      @click="showUploadDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-file-upload
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>Mettre à jour</v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-list-item
      v-if="can('readLines') && !error"
      @click="showIntegrationDialog = true; previewId = 'table'"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-code-tags
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>Intégrer dans un site</v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-list-item
      v-if="can('readApiDoc') && !error"
      @click="showAPIDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-cloud
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>Utiliser l'API</v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-list-item v-if="can('delete')" @click="showDeleteDialog = true">
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-delete
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>Supprimer</v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-list-item v-if="can('delete')" @click="showOwnerDialog = true">
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-account
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>Changer le propriétaire</v-list-item-title>
      </v-list-item-content>
    </v-list-item>

    <v-dialog v-model="showIntegrationDialog" max-width="1200">
      <v-card outlined>
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
        <v-card-text v-if="showIntegrationDialog" class="pb-0 px-4">
          Pour intégrer une prévisualisation de ce jeu de données dans un site vous pouvez copier le code suivant ou un code similaire dans le code source HTML.
          <br>
          <v-select
            v-if="dataset.previews && dataset.previews.length > 1"
            v-model="previewId"
            :items="dataset.previews"
            label="Type de prévisualisation"
            item-text="title"
            item-value="id"
            style="max-width: 200px;"
            hide-details
          />
          <br>
          <pre>
  &lt;iframe
    src="{{ previewLink }}"
    width="100%" height="300px" style="background-color: transparent; border: none;"
  /&gt;
            </pre>
          <br>
          Résultat:
          <iframe
            :src="previewLink"
            width="100%"
            height="300px"
            style="background-color: transparent; border: none;"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showAPIDialog" fullscreen>
      <v-card outlined>
        <v-toolbar
          dense
          flat
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

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title primary-title>
          Suppression du jeu de données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            :value="nbApplications === 1"
            type="error"
            outlined
          >
            Attention ! Ce jeu de données est utilisé par une visualisation. Si vous le supprimez cette visualisation ne sera plus fonctionnelle.
          </v-alert>
          <v-alert
            :value="nbApplications > 1"
            type="error"
            outlined
          >
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} visualisations. Si vous le supprimez ces visualisations ne seront plus fonctionnelles.
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
      <v-card outlined>
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
      <v-card outlined>
        <v-card-title primary-title>
          Remplacement des données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            :value="nbApplications === 1"
            type="error"
            outlined
          >
            Attention ! Ce jeu de données est utilisé par une application. Si vous modifiez sa structure l'application peut ne plus fonctionner.
          </v-alert>
          <v-alert
            :value="nbApplications > 1"
            type="error"
            outlined
          >
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} applications. Si vous modifiez sa structure ces applications peuvent ne plus fonctionner.
          </v-alert>
        </v-card-text>
        <v-card-text>
          <v-file-input
            label="sélectionnez un fichier"
            outlined
            dense
            style="max-width: 300px;"
            @change="onFileUpload"
          />
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
  </v-list>
</template>

<script>
  import { mapState, mapGetters, mapActions } from 'vuex'
  import OwnerPick from '~/components/owners/pick.vue'
  import OpenApi from '~/components/open-api.vue'
  import eventBus from '~/event-bus'

  export default {
    components: { OwnerPick, OpenApi },
    data: () => ({
      showDeleteDialog: false,
      showUploadDialog: false,
      showOwnerDialog: false,
      file: null,
      uploading: false,
      uploadProgress: 0,
      newOwner: null,
      showIntegrationDialog: false,
      showAPIDialog: false,
      previewId: 'table',
    }),
    computed: {
      ...mapState('dataset', ['dataset', 'nbApplications', 'dataFiles', 'error']),
      ...mapGetters('dataset', ['can', 'resourceUrl']),
      previewLink() {
        return this.dataset && this.dataset.previews.find(p => p.id === this.previewId).href
      },
    },
    methods: {
      ...mapActions('dataset', ['remove', 'changeOwner']),
      async confirmRemove() {
        this.showDeleteDialog = false
        await this.remove()
        this.$router.push({ path: '/datasets' })
      },
      onFileUpload(file) {
        this.file = file
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

<style lang="css" scoped>
</style>
