<template>
  <v-stepper
    v-model="currentStep"
    class="elevation-0"
  >
    <v-stepper-header>
      <v-stepper-step
        :step="1"
        :complete="!!file"
        editable
      >
        {{ $t('stepFile') }}
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :step="2"
        :complete="!!dataset"
        :editable="!!file"
      >
        {{ $t('stepDataset') }}
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :step="3"
        :complete="!!attachment"
        :editable="!!dataset"
      >
        {{ $t('stepAttachment') }}
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :step="4"
        :complete="!!metadataForm"
        :editable="!!publicationSite"
      >
        {{ $t('stepAction') }}
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p v-t="'loadMainFile'" />
        <div
          class="mt-3 mb-3"
          @drop.prevent="e => {file = e.dataTransfer.files[0]; if (!suggestArchive) currentStep = 2}"
          @dragover.prevent
        >
          <v-file-input
            v-model="file"
            :label="$t('selectFile')"
            outlined
            dense
            hide-details
            style="max-width: 400px;"
            :accept="accepted.join(', ')"
            @change="currentStep = 2"
          />
        </div>
        <v-alert
          v-if="file && file.size > 50000000 && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt') || file.name.endsWith('.geojson'))"
          outlined
          type="info"
          dense
          v-html="$t('suggestArchive', {name: file.name})"
        />
        <v-btn
          v-t="'continue'"
          class="mt-2"
          :disabled="!file"
          color="primary"
          @change="() => {if (!suggestArchive) currentStep = 2}"
        />

        <h3
          v-t="'formats'"
          class="text-h6 mt-4"
        />
        <dataset-file-formats />
      </v-stepper-content>

      <v-stepper-content step="2">
        <template v-if="file && similarDatasets && similarDatasets.length">
          <p class="mb-1">{{ $t('similarDatasets') }}</p>
          <v-card
            tile
            outlined
            style="width: 500px;"
          >
            <v-list class="py-0">
              <v-list-item-group
                :value="dataset && similarDatasets.findIndex(d => d.id === dataset.id)"
                color="primary"
              >
                <dataset-list-item
                  v-for="(dataset) in similarDatasets"
                  :key="dataset.id"
                  :dataset="dataset"
                  :show-owner="false"
                  :no-link="true"
                  :dense="true"
                  @click="toggleDataset(dataset);currentStep=3"
                />
              </v-list-item-group>
            </v-list>
          </v-card>
        </template>

        <v-row class="mt-4 mb-1 mx-0">
          <dataset-select
            :extra-params="{file: true}"
            @change="toggleDataset"
          />
        </v-row>

        <v-btn
          v-t="'continue'"
          color="primary"
          class="mt-4"
          :disabled="!dataset"
          @click.native="currentStep = 3"
        />
      </v-stepper-content>

      <v-stepper-content step="3">
        <v-alert
          type="info"
          outlined
          dense
          style="max-width:400px;"
        >
          {{ $t('attachmentInfo') }}
        </v-alert>
        <p v-t="'attachmentsMsg1'" />
        <p v-t="'attachmentsMsg2'" />
        <div
          class="mt-3 mb-3"
          @drop.prevent="e => {attachment = e.dataTransfer.files[0]; currentStep = 4}"
          @dragover.prevent
        >
          <v-file-input
            v-model="attachment"
            :label="$t('selectFile')"
            outlined
            dense
            style="max-width: 400px;"
            accept=".zip"
            hide-details
            clearable
            @change="currentStep = 4"
          />
        </div>
        <v-btn
          v-t="'continue'"
          color="primary"
          class="mt-4"
          @click.native="currentStep = 4"
        />
      </v-stepper-content>

      <v-stepper-content step="4">
        <template v-if="dataset && file">
          <p>{{ $t('updateMsg') }}</p>
          <v-row
            v-if="importing"
            class="mx-0 my-3"
          >
            <v-progress-linear
              v-model="uploadProgress.percent"
              class="my-1"
              rounded
              height="28"
              style="max-width: 500px;"
              :color="$readableColor($vuetify.theme.themes.light.primary, true)"
            >
              {{ file && file.name }}
              <template v-if="uploadProgress.total">
                {{ Math.floor(uploadProgress.percent) }}% {{ $t('of') }} {{ uploadProgress.total | bytes($i18n.locale) }}
              </template>
            </v-progress-linear>
            <v-btn
              icon
              color="warning"
              :title="$t('cancel')"
              @click="cancel"
            >
              <v-icon>mdi-cancel</v-icon>
            </v-btn>
          </v-row>
          <v-btn
            v-t="'update'"
            color="primary"
            :disabled="importing"
            @click.native="updateDataset"
          />
        </template>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  updateDataset: Mettre à jour un jeu de données
  dataset: Jeu de données
  selectDataset: Choisissez un jeu de données
  stepFile: Fichier
  stepDataset: Jeu de données
  stepAction: Confirmation
  stepAttachment: Pièces jointes
  continue: Continuer
  cancel: Annuler
  loadMainFile: Chargez un fichier de données principal.
  selectFile: sélectionnez ou glissez/déposez un fichier
  formats: Formats supportés
  attachmentInfo: Cette étape est optionnelle
  attachmentsMsg1: Vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.
  attachmentsMsg2: Le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
  suggestArchive: |
    Ce fichier est volumineux. Pour économiser du temps et de l'énergie vous pouvez si vous le souhaitez le charger sous forme compressée.
    <br>Pour ce faire vous devez créer soit un fichier "{name}.gz" soit une archive .zip contenant uniquement ce fichier.
  similarDatasets: "Ces jeux de données ont le même nom de fichier :"
  updateMsg: Après la soumission vous serez redirigé vers la page du jeu de données ou vous pourrez observer les changements et valider ou annuler l'opération.
  update: Mettre à jour
en:
  updateDataset: Update a dataset
  dataset: Dataset
  selectDataset: Select a dataset
  stepFile: File
  stepDataset: Dataset
  stepAction: Confirmation
  stepAttachment: Attachments
  continue: Continue
  cancel: Cancel
  loadMainFile: Load the main data file
  selectFile: select or drag and drop a file
  formats: Supported formats
  attachmentInfo: This step is optional
  attachmentsMsg1: You can load a zip archive containing files to be used as attachments to the lines of the main dataset file.
  attachmentsMsg2: The main data file must have a column that contains paths of the attachments in the archive.
  suggestArchive: |
    This file is large. To save and time and energy you can if you wish send a compressed version of it.
    <br>To do so you must create a file "{name}.gz" or a zip archive containing only this file.
  similarDatasets: "These datasets have the same file name:"
  updateMsg: After submitting you will be redirected to the page of dataset where you will be able to review the changes and validate or cancel the operation.
  update: Update
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  data: () => ({
    currentStep: 1,
    file: null,
    publicationSite: null,
    metadataForm: false,
    similarDatasets: null,
    attachment: null,
    uploadProgress: { rate: 0 },
    importing: false
  }),
  computed: {
    ...mapState(['accepted']),
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState('dataset', ['dataset']),
    suggestArchive () {
      return this.file && this.file.size > 50000000 && (this.file.name.endsWith('.csv') || this.file.name.endsWith('.tsv') || this.file.name.endsWith('.txt') || this.file.name.endsWith('.geojson'))
    }
  },
  watch: {
    async currentStep () {
      if (this.currentStep === 2) {
        this.similarDatasets = (await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner' } })).results
      }
    }
  },
  created () {
    this.$store.dispatch('breadcrumbs', [{ text: this.$t('datasets'), to: '/datasets' }, { text: this.$t('updateDataset') }])
  },
  methods: {
    async toggleDataset (dataset) {
      if (dataset) {
        await this.$store.dispatch('dataset/setId', { datasetId: dataset.id })
        this.currentStep = 3
      } else {
        this.$store.dispatch('dataset/clear')
      }
    },
    async updateDataset () {
      this.cancelSource = this.$axios.CancelToken.source()
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = {
              loaded: e.loaded,
              total: e.total,
              percent: (e.loaded / e.total) * 100
            }
          }
        },
        cancelToken: this.cancelSource.token,
        params: { draft: true }
      }
      const formData = new FormData()
      formData.append('dataset', this.file)
      if (this.attachment) {
        formData.append('attachments', this.attachment)
      }
      this.importing = true
      try {
        if (this.file.size > 100000) options.params.draft = 'true'
        const dataset = await this.$axios.$post('api/v1/datasets/' + this.dataset.id, formData, options)
        if (dataset.error) throw new Error(dataset.error)
        this.$router.push({ path: `/dataset/${dataset.id}` })
      } catch (error) {
        const status = error.response && error.response.status
        if (status === 413) {
          eventBus.$emit('notification', { type: 'error', msg: this.$t('fileTooLarge') })
        } else {
          eventBus.$emit('notification', { error, msg: this.$t('importError') })
        }
        this.importing = false
      }
    },
    cancel () {
      if (this.cancelSource) this.cancelSource.cancel(this.$t('cancelled'))
    }
  }
}
</script>
