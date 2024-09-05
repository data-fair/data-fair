<template>
  <v-list
    v-if="dataset"
    dense
    class="list-actions"
  >
    <v-subheader
      v-if="dataFiles && dataFiles.length"
      v-t="'downloads'"
    />
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
    <v-list-item
      v-if="dataset.isRest && user && user.adminMode"
      :href="resourceUrl + '/raw'"
    >
      <v-list-item-icon>
        <v-icon color="admin">
          mdi-progress-download
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title>{{ $t('downloadRawRest') }}</v-list-item-title>
        <v-list-item-subtitle>{{ $t('downloadRawRestSubtitle') }}</v-list-item-subtitle>
      </v-list-item-content>
    </v-list-item>
    <v-subheader v-t="'actions'" />
    <v-list-item
      v-if="can('writeData') && !dataset.isRest && !dataset.isVirtual && !dataset.isMetaOnly && !dataset.remoteFile"
      @click="showUploadDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-file-upload
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="'update'" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item
      v-if="can('readLines') && !error && !dataset.draftReason && !dataset.isMetaOnly"
      @click="showIntegrationDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-code-tags
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="'integrate'" />
      </v-list-item-content>
    </v-list-item>
    <template v-if="!error">
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
    </template>
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
        <v-list-item-title v-t="'useAPI'" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item @click="showNotifDialog = true">
      <v-list-item-icon>
        <v-icon color="primary">
          mdi-bell
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="'notifications'" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item
      v-if="user.adminMode"
      color="admin"
      @click="showWebhooksDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="admin">
          mdi-webhook
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title
          v-t="'webhooks'"
          class="admin--text"
        />
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
      <v-list-item-content>
        <v-list-item-title v-t="'delete'" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item
      v-if="dataset.isRest && can('deleteLine')"
      @click="showDeleteAllLinesDialog = true"
    >
      <v-list-item-icon>
        <v-icon color="warning">
          mdi-delete-sweep
        </v-icon>
      </v-list-item-icon>
      <v-list-item-content>
        <v-list-item-title v-t="'deleteAllLines'" />
      </v-list-item-content>
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
      <v-list-item-content>
        <v-list-item-title v-t="'changeOwner'" />
      </v-list-item-content>
    </v-list-item>

    <dataset-integration-dialog
      :show="showIntegrationDialog"
      :title="$t('integrate')"
      @hide="showIntegrationDialog = false"
    />

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
          <v-switch
            v-if="dataset.public && can('readPrivateApiDoc') && can('readApiDoc')"
            v-model="publicAPIDoc"
            :label="$t('switchPublicAPIDoc')"
            class="my-3"
            hide-details
          />
          <v-spacer />
          <v-btn
            icon
            @click.native="showAPIDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="showAPIDialog && resourceUrl">
          <open-api
            v-if="publicAPIDoc"
            :url="resourceUrl + '/api-docs.json' + (dataset.draftReason ? '?draft=true' : '')"
          />
          <open-api
            v-else
            :url="resourceUrl + '/private-api-docs.json' + (dataset.draftReason ? '?draft=true' : '')"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showDeleteDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title
          v-t="'deleteDataset'"
          primary-title
        />
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            :value="true"
            type="error"
            outlined
            v-text="$tc('deleteWarning', nbApplications)"
          />
        </v-card-text>
        <v-card-text v-t="{path: 'deleteMsg', args: {title: dataset.title}}" />
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
      v-model="showDeleteAllLinesDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title
          v-t="'allLinesDeletion'"
          primary-title
        />
        <v-card-text>
          <v-alert
            v-t="{path: 'deleteAllLinesWarning', args: {title: dataset.title}}"
            type="error"
            outlined
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'no'"
            text
            @click="showDeleteAllLinesDialog = false"
          />
          <v-btn
            v-t="'yes'"
            color="warning"
            @click="confirmDeleteAllLines"
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
            :current-owner="dataset.owner"
          />
          <v-alert
            type="warning"
            outlined
          >
            <p>
              Le changement de propriétaire peut avoir de nombreux effets sur un jeu de données. Avant de confirmer l'opération effectuez ces vérifications :
            </p>
            <p>
              <ul>
                <li>
                  quelles personnes ont les permissions nécessaires pour contribuer ou pour utiliser le jeu de données ?
                </li>
                <li>
                  quelles applications utilisent le jeu de données ?
                </li>
                <li>
                  sur quels portails le jeu de données est-il publié ?
                </li>
                <li>
                  sur quels catalogues le jeu de données est-il publié ?
                </li>
                <li>
                  le jeu de données est-il utilisé par des programmes qui utilisent une clé d'API du compte propriétaire ?
                </li>
                <li>
                  le jeu de données est-il associé à un traitement automatisé ?
                </li>
              </ul>
            </p>
            <p>
              Après la confirmation vérifiez de nouveaux tous ces aspects et effectuez les corrections nécessaires.
            </p>
          </v-alert>
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
      v-model="showUploadDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-card-title
          v-t="'dataUpdate'"
          primary-title
        />
        <v-card-text v-if="nbApplications > 0">
          <v-alert
            type="error"
            outlined
            :value="true"
            v-text="$tc('updateWarning', nbApplications)"
          />
        </v-card-text>
        <v-card-text>
          <v-file-input
            :label="$t('selectFile')"
            outlined
            dense
            style="max-width: 300px;"
            :accept="accepted.join(', ')"
            @change="onFileUpload"
          />
          <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
            <p v-t="'attachmentsMsg'" />
            <v-file-input
              :label="$t('selectAttachmentsFile')"
              outlined
              dense
              style="max-width: 300px;"
              accept=".zip"
              @change="onAttachmentsFileUpload"
            />
          </template>
          <v-progress-linear
            v-if="uploading"
            v-model="uploadProgress"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'cancel'"
            text
            @click="showUploadDialog = false"
          />
          <v-btn
            v-t="'load'"
            :disabled="!(file || attachmentsFile) || uploading"
            color="warning"
            @click="confirmUpload"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showNotifDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-toolbar
          dense
          flat
        >
          <v-toolbar-title v-t="'notification'" />
          <v-spacer />
          <v-btn
            icon
            @click.native="showNotifDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text class="py-0 px-3">
          <v-iframe :src="notifUrl" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="showWebhooksDialog"
      max-width="500"
    >
      <v-card outlined>
        <v-toolbar
          dense
          flat
        >
          <v-toolbar-title v-t="'webhooks'" />
          <v-spacer />
          <v-btn
            icon
            @click.native="showWebhooksDialog = false"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text class="py-0 px-3">
          <v-iframe :src="webhooksUrl" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  downloads: TÉLÉCHARGEMENTS
  downloadRawRest: Export frais
  downloadRawRestSubtitle: attention charge importante
  actions: ACTIONS
  update: Mettre à jour
  integrate: Intégrer dans un site
  viewSite: Voir sur {title}
  useAPI: Utiliser l'API
  switchPublicAPIDoc: Voir l'API publique
  delete: Supprimer
  deleteAllLines: Supprimer toutes les lignes
  changeOwner: Changer le propriétaire
  deleteDataset: Suppression du jeu de données
  deleteWarning: " | Attention ! Ce jeu de données est utilisé par une application. Si vous le supprimez cette application ne sera plus fonctionnelle. | Attention ! Ce jeu de données est utilisé par {count} applications. Si vous le supprimez ces applications ne seront plus fonctionnelles."
  updateWarning: " | Attention ! Ce jeu de données est utilisé par une application. Si vous modifiez sa structure l'application peut ne plus fonctionner. | Attention ! Ce jeu de données est utilisé par {count} applications. Si vous modifiez sa structure les applications peuvent ne plus fonctionner."
  deleteMsg: Voulez vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
  allLinesDeletion: Suppression des lignes du jeu de données
  deleteAllLinesWarning: Voulez vous vraiment supprimer toutes les lignes du jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  changeOwnerTitle: Changer le propriétaire du jeu de données
  cancel: Annuler
  confirm: Confirmer
  load: Charger
  dataUpdate: Remplacement des données
  selectFile: sélectionnez un fichier
  selectAttachmentsFile: sélectionnez un fichier zip de pièces jointes
  fileTooLarge: Le fichier est trop volumineux pour être importé
  importError: "Erreur pendant l'import du fichier :"
  notifications: Notifications
  webhooks: Webhooks
  ok: ok
  attachmentsMsg: Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal. Dans ce cas le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
en:
  downloads: DOWNLOADS
  downloadRawRest: Fresh export
  downloadRawRestSubtitle: Beware important load
  actions: ACTIONS
  update: Update
  integrate: Integrate into a website
  viewSite: See on {title}
  useAPI: Use the API
  delete: Delete
  deleteAllLines: Delete all lines
  changeOwner: Change owner
  deleteDataset: Dataset deletion
  deleteWarning: " | Warning ! This dataset is used by a application. If you delete it this application will be broken. | Warning ! This dataset is used by {count} applications. If you delete it these applications will be broken."
  updateWarning: " | Warning ! This dataset is used by a application. If you change its structure this application might be broken. | Warning ! This dataset is used by {count} applications. If you change its structure these applications might be broken."
  deleteMsg: Do you really want to delete the dataset "{title}" ? Deletion is definitive and data will not be recoverable.
  yes: Yes
  no: No
  allLinesDeletion: Delete all the lines of the dataset
  deleteAllLinesWarning: Do you really want to delete all the lines of the dataset "{title}" ? Deletion is definitive and data will not be recoverable.
  changeOwnerTitle: Change the owner of the dataset
  cancel: Cancel
  confirm: Confirm
  load: Load
  dataUpdate: Replace the data
  selectFile: select a file
  selectAttachmentsFile: select an attachments zip file
  fileTooLarge: The file is too large to be imported
  importError: "Failure to import the file :"
  notifications: Notifications
  webhooks: Webhooks
  ok: ok
  attachmentsMsg: Optionally you can load a zip archive containing files to be used as attachments to the lines of the main dataset file. In this case the main data file must have a column that contains paths of the attachments in the archive.
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import eventBus from '~/event-bus'
const webhooksSchema = require('~/../contract/settings').properties.webhooks

export default {
  components: { VIframe },
  props: {
    publicationSites: {
      type: Array,
      default: () => []
    }
  },
  data: () => ({
    showDeleteDialog: false,
    showDeleteAllLinesDialog: false,
    showUploadDialog: false,
    showOwnerDialog: false,
    file: null,
    attachmentsFile: null,
    uploading: false,
    uploadProgress: 0,
    newOwner: null,
    showIntegrationDialog: false,
    showAPIDialog: false,
    publicAPIDoc: true,
    showNotifDialog: false,
    showWebhooksDialog: false
  }),
  computed: {
    ...mapState(['env', 'accepted']),
    ...mapState('session', ['user']),
    ...mapState('dataset', ['dataset', 'nbApplications', 'dataFiles', 'error']),
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    publicationSitesLinks () {
      if (!this.dataset.publicationSites) return []
      return this.dataset.publicationSites.map(dps => {
        const site = this.publicationSites.find(site => dps === `${site.type}:${site.id}`)
        if (!site?.datasetUrlTemplate) return null
        return {
          url: site.datasetUrlTemplate.replace('{id}', this.dataset.id).replace('{slug}', this.dataset.slug),
          title: site.title || (site.url && site.url.replace('http://', '').replace('https://', '')) || site.id
        }
      }).filter(ps => !!ps)
    },
    notifUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const.startsWith('dataset') && item.const !== 'dataset-dataset-created')

      const keysParam = webhooks.map(w => `data-fair:${w.const}:${this.dataset.slug}`).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      const urlTemplate = `${this.env.publicUrl}/dataset/{id}`
      let sender = `${this.dataset.owner.type}:${this.dataset.owner.id}`
      if (this.dataset.owner.department) sender += ':' + this.dataset.owner.department
      return `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&url-template=${encodeURIComponent(urlTemplate)}&sender=${encodeURIComponent(sender)}&register=false`
    },
    webhooksUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const === 'dataset-data-updated')

      const keysParam = webhooks.map(w => `data-fair:${w.const}:${this.dataset.slug}`).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      let sender = `${this.dataset.owner.type}:${this.dataset.owner.id}`
      if (this.dataset.owner.department) sender += ':' + this.dataset.owner.department
      return `${this.env.notifyUrl}/embed/subscribe-webhooks?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&sender=${encodeURIComponent(sender)}`
    }
  },
  created () {
    if (this.can('readPrivateApiDoc')) this.publicAPIDoc = false
  },
  methods: {
    ...mapActions('dataset', ['remove', 'changeOwner']),
    async confirmRemove () {
      this.showDeleteDialog = false
      await this.remove()
      this.$router.push({ path: '/datasets' })
    },
    async confirmDeleteAllLines () {
      this.showDeleteAllLinesDialog = false
      await this.$axios.$delete(`api/v1/datasets/${this.dataset.id}/lines`)
    },
    onFileUpload (file) {
      this.file = file
    },
    onAttachmentsFileUpload (file) {
      this.attachmentsFile = file
    },
    async confirmUpload () {
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        },
        params: { draft: 'true' }
      }
      const formData = new FormData()
      if (this.file) formData.append('file', this.file)
      if (this.attachmentsFile) formData.append('attachments', this.attachmentsFile)

      this.uploading = true
      try {
        await this.$axios.$put('api/v1/datasets/' + this.dataset.id, formData, options)
        this.showUploadDialog = false
      } catch (error) {
        const status = error.response && error.response.status
        if (status === 413) {
          eventBus.$emit('notification', { type: 'error', msg: this.$t('fileTooLarge') })
        } else {
          eventBus.$emit('notification', { error, msg: this.$t('importError') })
        }
      }
      this.uploading = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
