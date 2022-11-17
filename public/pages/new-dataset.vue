<template>
  <v-stepper
    v-model="currentStep"
    class="elevation-0"
  >
    <v-stepper-header>
      <v-stepper-step
        step="1"
        :complete="!!datasetType"
        editable
      >
        {{ $t('datasetType') }}
      </v-stepper-step>
      <template v-if="datasetType === 'file'">
        <v-divider />
        <v-stepper-step
          step="2"
          :complete="!!file"
          :editable="!!datasetType"
        >
          {{ $t('stepFile') }}
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          step="3"
          :complete="!!attachment"
          :editable="!!file"
        >
          {{ $t('stepAttachment') }}
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          step="4"
          :editable="!!file"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
      </template>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-list>
          <p v-t="'choseType'" />
          <v-list-item
            v-for="type of datasetTypes"
            :key="type"
            @click="datasetType = type; $nextTick(() => currentStep = 2);"
          >
            <v-list-item-icon>
              <v-icon color="primary">{{ datasetTypeIcons[type] }}</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title v-t="'type_' + type" />
              <v-list-item-subtitle
                v-t="'type_desc_' + type"
                style="white-space:normal"
              />
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-stepper-content>

      <template v-if="datasetType === 'file'">
        <v-stepper-content step="2">
          <p v-t="'loadMainFile'" />
          <div
            class="mt-3 mb-3"
            @drop.prevent="e => {file = e.dataTransfer.files[0]; currentStep = 3}"
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
              @change="currentStep = 3"
            />
          </div>
          <v-alert
            v-if="file && file.size > 50000000 && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt') || file.name.endsWith('.geojson'))"
            outlined
            type="info"
            v-html="$t('suggestArchive', {name: file.name})"
          />
          <div
            v-if="file"
            class="mt-3 mb-3"
          >
            <v-text-field
              v-model="title"
              name="title"
              outlined
              dense
              hide-details
              :label="$t('title')"
              :placeholder="$t('titlePlaceholder')"
              style="max-width: 400px"
            />
          </div>
          <v-btn
            v-t="'continue'"
            class="mt-2"
            :disabled="!file"
            color="primary"
            @click.native="currentStep = 3"
          />

          <h3
            v-t="'formats'"
            class="text-h6 mt-4"
          />
          <dataset-file-formats />
        </v-stepper-content>

        <v-stepper-content step="3">
          <v-alert
            type="info"
            outlined
            style="max-width:400px;"
          >
            {{ $t('attachmentInfo') }}
          </v-alert>
          <p v-t="'attachmentsMsg1'" />
          <p v-t="'attachmentsMsg2'" />
          <div
            class="mt-3 mb-3"
            @drop.prevent="e => {attachment = e.dataTransfer.files[0]}"
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
            />
            <v-checkbox
              v-if="attachment"
              v-model="attachmentsAsImage"
              hide-details
              :label="$t('attachmentsAsImage')"
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
          <v-radio-group
            v-model="action"
            class="mt-3 mb-3"
            hide-details
            :disabled="importing"
          >
            <v-radio
              v-for="a in actions"
              :key="a.id"
              :label="a.title"
              :value="a"
            />
          </v-radio-group>
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
            v-t="'import'"
            :disabled="!action || importing"
            color="primary"
            @click.native="importData()"
          />
        </v-stepper-content>
      </template>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  datasetType: Type de jeu de données
  newDataset: Créer un jeu de données
  datasets: Jeux de données
  choseType: Choisissez le type de jeu de données que vous souhaitez créer.
  type_file: Fichier
  type_desc_file: Chargez un fichier parmi les nombreux formats supportés.
  type_rest: Éditable
  type_desc_rest: Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.
  type_virtual: Virtuel
  type_desc_virtual: Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.
  type_metaOnly: Métadonnées seules
  type_desc_metaOnly: "Créez un pseudo jeu de données sans données locales, uniquement les autres informations (description, pièces jointes, etc)."
  stepFile: Sélection du fichier
  stepAttachment: Pièces jointes
  stepAction: Confirmation
  loadMainFile: Chargez un fichier de données principal.
  selectFile: sélectionnez ou glissez/déposez un fichier
  title: Titre du jeu de données
  titlePlaceholder: Laissez vide pour utiliser le nom de fichier
  continue: Continuer
  formats: Formats supportés
  attachmentInfo: Cette étape est optionnelle
  attachmentsMsg1: Vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.
  attachmentsMsg2: Le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
  attachmentsAsImage: Traiter les pièces jointes comme des images
  import: Lancer l'import
  createDataset: Créer un nouveau jeu de données
  updateDataset: Mettre à jour les données du jeu {title}
  fileTooLarge: Le fichier est trop volumineux pour être importé
  importError: "Erreur pendant l'import du fichier :"
  cancel: Annuler
  cancelled: Chargement annulé par l'utilisateur
  suggestArchive: |
    Ce fichier est volumineux. Pour économiser du temps et de l'énergie vous pouvez si vous le souhaitez le charger sous forme compressée.
    <br>Pour ce faire vous devez créer soit un fichier "{name}.gz" soit une archive .zip contenant uniquement ce fichier.
  of: de
en:
  datasetType: Type de jeu de données
  newDataset: Create a dataset
  datasets: Datasets
  choseType: Chose the type of dataset you wish to create.
  type_file: File
  type_desc_file: Load a file among the many supported formats.
  type_rest: Editable
  type_desc_rest: Create a dataset whose content will be writable directly through a form.
  type_virtual: Virtual
  type_desc_virtual: Create a restricted virtual vue over one or more datasets.
  type_metaOnly: Metadata only
  type_desc_metaOnly: Create a pseudo dataset without any local data, only other information (description, attachments, etc).
  stepFile: File selection
  stepAttachment: Attachments
  stepAction: Perform the action
  loadMainFile: Load the main data file
  selectFile: select a file
  title: Dataset title
  titlePlaceholder: Leave empty to use the file name
  continue: Continue
  formats: Supported formats
  attachmentInfo: This step is optional
  attachmentsMsg1: You can load a zip archive containing files to be used as attachments to the lines of the main dataset file.
  attachmentsMsg2: The main data file must have a column that contains paths of the attachments in the archive.
  attachmentsAsImage: Process the attachments as images
  import: Proceed with importing data
  createDataset: Create a new dataset
  updateDataset: Update the data of the dataset {title}
  fileTooLarge: The file is too large to be imported
  importError: "Failure to import the file :"
  cancel: Cancel
  cancelled: Loading cancelled by user
  suggestArchive: |
    This file is large. To save and time and energy you can if you wish send a compressed version of it.
    <br>To do so you must create a file "{name}.gz" or a zip archive containing only this file.
  of: of
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  data: () => ({
    file: null,
    attachment: null,
    attachmentsAsImage: false,
    currentStep: 1,
    uploadProgress: { rate: 0 },
    actions: [],
    action: null,
    importing: false,
    title: '',
    datasetTypes: ['file', 'rest', 'virtual', 'metaOnly'],
    datasetTypeIcons: {
      file: 'mdi-file-upload',
      rest: 'mdi-all-inclusive',
      virtual: 'mdi-picture-in-picture-bottom-right-outline',
      metaOnly: 'mdi-information-variant'
    },
    datasetType: null
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env', 'accepted']),
    cleanTitle () {
      const trimmed = this.title.trim()
      return trimmed.length > 3 ? trimmed : null
    }
  },
  watch: {
    async currentStep () {
      if (this.currentStep === 4) {
        let existingDatasets
        if (this.cleanTitle) {
          existingDatasets = { results: [] }
        } else {
          existingDatasets = await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}` } })
        }
        this.actions = [{ type: 'create', title: this.$t('createDataset') }, ...existingDatasets.results.map(d => ({
          type: 'update',
          id: d.id,
          title: this.$t('updateDataset', { title: d.title })
        }))]
        this.action = this.actions[0]
      }
    }
  },
  created () {
    this.$store.dispatch('breadcrumbs', [{ text: this.$t('datasets'), to: '/datasets' }, { text: this.$t('newDataset') }])
  },
  methods: {
    async importData () {
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
        params: {}
      }
      const formData = new FormData()

      formData.append('dataset', this.file)
      if (this.attachment) {
        formData.append('attachments', this.attachment)
        if (this.attachmentsAsImage) formData.append('attachmentsAsImage', true)
      }
      if (this.cleanTitle) formData.append('title', this.cleanTitle)
      this.importing = true
      try {
        let dataset
        if (this.action.type === 'create') {
          if (this.file.size > 100000) options.params.draft = 'true'
          dataset = await this.$axios.$post('api/v1/datasets', formData, options)
        } else {
          options.params.draft = 'true'
          dataset = await this.$axios.$post('api/v1/datasets/' + this.action.id, formData, options)
        }
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
