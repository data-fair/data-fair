<template>
  <v-layout v-if="dataset" column class="dataset">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :disabled="!can('readDescription')" :nuxt="true" :to="`/dataset/${dataset.id}/description`">
        Description
        <v-icon>toc</v-icon>
      </v-tab>
      <v-tab v-if="can('writeDescription') && dataset.isVirtual" :nuxt="true" :to="`/dataset/${dataset.id}/virtual`">
        Jeu virtuel
        <v-icon>picture_in_picture</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readLines')" :nuxt="true" :to="`/dataset/${dataset.id}/tabular`">
        Vue tableau
        <v-icon>view_list</v-icon>
      </v-tab>
      <v-tab v-if="dataset.bbox" :disabled="!can('readLines')" :nuxt="true" :to="`/dataset/${dataset.id}/map`">
        Carte
        <v-icon>map</v-icon>
      </v-tab>
      <v-tab v-if="fileProperty" :disabled="!can('readLines')" :nuxt="true" :to="`/dataset/${dataset.id}/search-files`">
        Fichiers
        <v-icon>file_copy</v-icon>
      </v-tab>
      <v-tab v-if="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')" :disabled="!can('readLines')" :nuxt="true" :to="`/dataset/${dataset.id}/thumbnails`">
        Vignettes
        <v-icon>image</v-icon>
      </v-tab>
      <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/dataset/${dataset.id}/permissions`">
        Permissions
        <v-icon>security</v-icon>
      </v-tab>
      <v-tab v-if="!dataset.isVirtual" :disabled="!can('writeDescription')" :nuxt="true" :to="`/dataset/${dataset.id}/extend`">
        Enrichissement
        <v-icon>merge_type</v-icon>
      </v-tab>
      <v-tab v-if="can('getPermissions')" :nuxt="true" :to="`/dataset/${dataset.id}/publications`">
        Publications
        <v-icon>publish</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readJournal')" :nuxt="true" :to="`/dataset/${dataset.id}/journal`">
        Journal
        <v-icon>event_note</v-icon>
      </v-tab>
      <v-tab :disabled="!can('readApiDoc')" :nuxt="true" :to="`/dataset/${dataset.id}/api`">
        API
        <v-icon>cloud</v-icon>
      </v-tab>
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
          <v-list-tile v-if="can('writeData')" @click="showUploadDialog = true">
            <v-list-tile-avatar>
              <v-icon color="warning">
                upload_file
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Remplacer</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :disabled="!can('downloadOriginalData')" :href="downloadLink">
            <v-list-tile-avatar>
              <v-icon color="primary">
                file_download
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Fichier d'origine</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :href="downloadFullLink" :disabled="!can('downloadFullData') || !dataset.extensions || !dataset.extensions.find(e => e.active)">
            <v-list-tile-avatar>
              <v-icon color="primary">
                file_download
              </v-icon>
            </v-list-tile-avatar>
            <v-list-tile-title>Fichier enrichi</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>
    </div>

    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-card-title primary-title>
          Suppression du jeu de données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert :value="nbApplications === 1" type="error" outline>
            Attention ! Ce jeu de données est utilisé par une application. Si vous le supprimez cette application ne sera plus fonctionnelle.
          </v-alert>
          <v-alert :value="nbApplications > 1" type="error" outline>
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} applications. Si vous le supprimez ces applications ne seront plus fonctionnelles.
          </v-alert>
        </v-card-text>
        <v-card-text>
          Voulez vous vraiment supprimer le jeu de données "{{ dataset.title }}" ? La suppression est définitive et les données ne pourront pas être récupérées.
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
          Changer le propriétaire du jeu de données
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

    <v-dialog v-model="showUploadDialog" max-width="500">
      <v-card>
        <v-card-title primary-title>
          Remplacement des données
        </v-card-title>
        <v-card-text v-if="nbApplications > 0">
          <v-alert :value="nbApplications === 1" type="error" outline>
            Attention ! Ce jeu de données est utilisé par une application. Si vous modifiez sa structure l'application peut ne plus fonctionner.
          </v-alert>
          <v-alert :value="nbApplications > 1" type="error" outline>
            Attention ! Ce jeu de données est utilisé par {{ nbApplications }} applications. Si vous modifiez sa structure ces applications peuvent ne plus fonctionner.
          </v-alert>
        </v-card-text>
        <v-card-text>
          <input type="file" @change="onFileUpload">
          <v-progress-linear v-if="uploading" v-model="uploadProgress" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn flat @click="showUploadDialog = false">
            Annuler
          </v-btn>
          <v-btn :disabled="!file || uploading" color="warning" @click="confirmUpload">
            Charger
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'
import OwnerPick from '../../components/OwnerPick.vue'
import eventBus from '../../event-bus'

export default {
  components: { OwnerPick },
  data: () => ({
    showDeleteDialog: false,
    showUploadDialog: false,
    showOwnerDialog: false,
    file: null,
    uploading: false,
    uploadProgress: 0,
    newOwner: null
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
    }
  },
  async fetch({ store, params, route }) {
    await store.dispatch('dataset/setId', route.params.id)
    await store.dispatch('fetchVocabulary', route.params.id)
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions('dataset', ['patch', 'remove', 'clear', 'changeOwner']),
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
        }
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
          eventBus.$emit('notification', { type: 'error', msg: `Le fichier est trop volumineux pour être importé` })
        } else if (status === 429) {
          eventBus.$emit('notification', { type: 'error', msg: `Le propriétaire sélectionné n'a pas assez d'espace disponible pour ce fichier` })
        } else {
          eventBus.$emit('notification', { error, msg: `Erreur pendant l'import du fichier:` })
        }
      }
      this.uploading = false
    }
  }
}
</script>

<style>
</style>
