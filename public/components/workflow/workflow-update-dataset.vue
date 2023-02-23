<template>
  <v-stepper
    v-if="ready"
    v-model="currentStep"
    class="elevation-0"
  >
    <v-stepper-header>
      <v-stepper-step
        :step="1"
        :complete="!!datasetType"
        editable
      >
        {{ $t('datasetType') }}
        <small
          v-if="datasetType"
          v-t="'type_' + datasetType"
        />
      </v-stepper-step>

      <!-- FILE steps -->
      <template v-if="datasetType === 'file'">
        <v-divider />
        <v-stepper-step
          :step="2"
          :complete="!!file"
          editable
        >
          {{ $t('stepFile') }}
          <small
            v-if="file"
          >
            {{ file.name | truncate(30) }}
          </small>
        </v-stepper-step>
        <v-divider />

        <v-stepper-step
          :step="3"
          :complete="!!dataset"
          :editable="!!file"
        >
          {{ $t('stepDataset') }}
          <small v-if="dataset">
            {{ dataset.title | truncate(30) }}
          </small>
        </v-stepper-step>
        <v-divider />

        <template v-if="dataset && digitalDocumentField">
          <v-stepper-step
            :step="4"
            :complete="!!attachment"
            :editable="!!dataset"
          >
            {{ $t('stepAttachment') }}
            <small
              v-if="attachment"
              v-t="'loaded'"
            />
          </v-stepper-step>
          <v-divider />
        </template>

        <v-stepper-step
          :step="(dataset && digitalDocumentField) ? 5 : 4"
          :complete="imported"
          :editable="!!dataset"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
        <v-divider />

        <v-stepper-step
          :step="(dataset && digitalDocumentField) ? 6 : 5"
          :editable="imported"
        >
          {{ $t('stepReview') }}
        </v-stepper-step>
      </template>

      <!-- REST steps -->
      <template v-if="datasetType === 'rest'">
        <v-divider />
        <v-stepper-step
          :step="2"
          :complete="!!dataset"
          editable
        >
          {{ $t('stepDataset') }}
          <small v-if="dataset">
            {{ dataset.title | truncate(30) }}
          </small>
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          :editable="!!dataset"
        >
          {{ $t('editTable') }}
        </v-stepper-step>
      </template>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p v-t="'choseType'" />
        <v-row
          dense
          class="mt-2 mb-6"
        >
          <v-card
            v-for="type of datasetTypes"
            :key="type"
            width="460px"
            class="ma-1"
            outlined
            hover
            tile
            :disabled="!datasetsCount[type]"
            @click="datasetType = type; $nextTick(() => currentStep = 2);"
          >
            <v-card-title class="primary--text">
              <v-icon
                color="primary"
                class="mr-2"
              >
                {{ datasetTypeIcons[type] }}
              </v-icon>
              {{ $t('type_' + type) }}
            </v-card-title>
            <v-card-text>
              <p>
                {{ $t('type_desc_' + type) }}
              </p>
              <p class="text-caption mb-0">
                {{ $tc('datasetsCount', datasetsCount[type]) }}
              </p>
            </v-card-text>
          </v-card>
        </v-row>
      </v-stepper-content>

      <!-- FILE steps -->
      <template v-if="datasetType === 'file'">
        <v-stepper-content step="2">
          <p v-t="'loadMainFile'" />
          <div
            class="mt-3 mb-3"
            @drop.prevent="e => {file = e.dataTransfer.files[0]; if (!suggestArchive) currentStep = 3}"
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
            dense
            v-html="$t('suggestArchive', {name: file.name})"
          />
          <v-btn
            v-t="'continue'"
            class="mt-2"
            :disabled="!file"
            color="primary"
            @change="() => {if (!suggestArchive) currentStep = 3}"
          />

          <h3
            v-t="'formats'"
            class="text-h6 mt-4"
          />
          <dataset-file-formats />
        </v-stepper-content>

        <v-stepper-content step="3">
          <template v-if="file && similarDatasets && similarDatasets.length">
            <p class="mb-1">{{ $tc('similarDatasets', similarDatasets.length) }}</p>
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
                    @click="toggleDataset(dataset, 4)"
                  />
                </v-list-item-group>
              </v-list>
            </v-card>
          </template>

          <v-row class="mt-4 mb-1 mx-0">
            <dataset-select
              :extra-params="fileDatasetsFilter"
              @change="dataset => toggleDataset(dataset, 4)"
            />
          </v-row>

          <v-btn
            v-t="'continue'"
            color="primary"
            class="mt-4"
            :disabled="!dataset"
            @click.native="currentStep = 4"
          />
        </v-stepper-content>

        <v-stepper-content
          v-if="dataset && digitalDocumentField"
          step="4"
        >
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
            @drop.prevent="e => {attachment = e.dataTransfer.files[0]; currentStep = 5}"
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
              @change="currentStep = 5"
            />
          </div>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="mt-4"
            @click.native="currentStep = 5"
          />
        </v-stepper-content>

        <v-stepper-content :step="(dataset && digitalDocumentField) ? 5 : 4">
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
                style="max-width: 600px;"
                :color="$store.getters.readablePrimaryColor"
              >
                {{ file && file.name | truncate(40) }}
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

        <v-stepper-content :step="(dataset && digitalDocumentField) ? 6 : 5">
          <template v-if="imported && dataset">
            <dataset-status :simple-mode="true" />
            <dataset-schema />
            <dataset-table />
          </template>
        </v-stepper-content>
      </template>

      <!-- REST steps -->
      <template v-if="datasetType === 'rest'">
        <v-stepper-content step="2">
          <v-row class="mt-4 mb-1 mx-0">
            <dataset-select
              :extra-params="restDatasetsFilter"
              @change="dataset => toggleDataset(dataset, 3)"
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
          <dataset-table v-if="dataset" />
        </v-stepper-content>
      </template>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  updateDataset: Mettre à jour un jeu de données
  datasetType: Type de mise à jour
  choseType: Quelle action de mise à jour souhaitez vous effectuer ?
  home: Accueil
  type_file: Remplacer un fichier
  type_desc_file: Chargez un fichier parmi les nombreux formats supportés et remplacez le fichier d'un jeu de données existant.
  type_rest: Contribuer à un jeu de données éditable
  type_desc_rest: Créez, supprimez et éditez des lignes. Vous pouvez également charger un fichier pour mettre à jour plusieurs lignes à la fois.
  dataset: Jeu de données
  selectDataset: Choisissez un jeu de données
  stepFile: Fichier
  stepDataset: Jeu de données
  stepAction: Confirmation
  stepAttachment: Pièces jointes
  stepReview: Résultat
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
  similarDatasets: " | Ce jeu de données a le même nom de fichier : | Ces jeux de données ont le même nom de fichier :"
  updateMsg: Après la soumission vous pourrez observer les changements et vous serez averti si il y a un risque d'incompatibilité.
  update: Mettre à jour
  loaded: chargées
  editTable: Édition des lignes
  datasetsCount: "Vous ne pouvez mettre à jour aucun jeu de données | Vous pouvez mettre à jour 1 jeu de données | Vous pouvez mettre à jour {count} jeux de données"
en:
  updateDataset: Update a dataset
  datasetType: Dataset type
  choseType: What update action do you wish to perform ?
  home: Home
  type_file: Replace a file
  type_desc_file: Load a file among the many supported formats and replace an existing file.
  type_rest: Contribute to an editable file
  type_desc_rest: Create, update and delete lines. You can also load a file to upadte multiple lines.
  dataset: Dataset
  selectDataset: Select a dataset
  stepFile: File
  stepDataset: Dataset
  stepAction: Confirmation
  stepAttachment: Attachments
  stepReview: Review
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
  similarDatasets: " | This dataset has the same file name: | These datasets have the same file name:"
  updateMsg: After submitting you will be be able to review the changes and you will be warned if there is an incompatibility.
  update: Update
  loaded: loaded
  editTable: Edit lines
  datasetsCount: "You can't update any dataset | You can update 1 dataset | You can update {count} datasets"
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  props: {
    datasetParams: { type: Object, default: () => ({}) }
  },
  data: () => ({
    ready: false,
    currentStep: 1,
    file: null,
    similarDatasets: null,
    attachment: null,
    uploadProgress: { rate: 0 },
    importing: false,
    imported: false,
    datasetTypes: ['file', 'rest'],
    datasetTypeIcons: {
      file: 'mdi-file-upload',
      rest: 'mdi-all-inclusive'
    },
    datasetType: null,
    datasetsCount: {
      file: null,
      rest: null
    }
  }),
  computed: {
    ...mapState(['accepted']),
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['digitalDocumentField']),
    suggestArchive () {
      return this.file && this.file.size > 50000000 && (this.file.name.endsWith('.csv') || this.file.name.endsWith('.tsv') || this.file.name.endsWith('.txt') || this.file.name.endsWith('.geojson'))
    },
    ownerFilter () {
      const owner = this.activeAccount
      let ownerFilter = `${owner.type}:${owner.id}`
      if (owner.department) ownerFilter += `:${owner.department}`
      return ownerFilter
    },
    fileDatasetsFilter () {
      return { owner: this.ownerFilter, ...this.datasetParams, file: true, can: 'writeData' }
    },
    restDatasetsFilter () {
      return { owner: this.ownerFilter, ...this.datasetParams, rest: true, can: 'createLine,updateLine' }
    }
  },
  watch: {
    async currentStep () {
      if (this.datasetType === 'file' && this.currentStep === 3) {
        this.similarDatasets = (await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner', ...this.fileDatasetsFilter } })).results
      }
    }
  },
  async created () {
    this.$store.dispatch('dataset/clear')
    this.$store.dispatch('breadcrumbs', [{ text: this.$t('home'), to: '/' }, { text: this.$t('updateDataset') }])

    this.datasetsCount.file = (await this.$axios.$get('api/v1/datasets', { params: { size: 0, ...this.fileDatasetsFilter } })).count
    this.datasetsCount.rest = (await this.$axios.$get('api/v1/datasets', { params: { size: 0, ...this.restDatasetsFilter } })).count
    if (this.$route.query.updated) {
      this.datasetType = 'file'
      await this.$store.dispatch('dataset/setId', { datasetId: this.$route.query.updated, draftMode: true })
      this.$store.dispatch('dataset/subscribe')
      this.imported = true
      this.currentStep = (this.dataset && this.digitalDocumentField) ? 6 : 5
    }
    this.ready = true
  },
  methods: {
    async toggleDataset (dataset, nextStep) {
      if (dataset) {
        await this.$store.dispatch('dataset/setId', { datasetId: dataset.id, draftMode: true })
        this.$store.dispatch('dataset/subscribe')
        this.currentStep = nextStep
        if (this.datasetType === 'rest') {
          this.$router.push({ query: { ...this.$route.query, updated: this.dataset.id } })
        }
      } else {
        this.$store.dispatch('dataset/clear')
      }
      this.importing = false
      this.imported = false
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
        await this.$axios.$post('api/v1/datasets/' + this.dataset.id, formData, options)
        this.imported = true
        this.currentStep += 1
        this.$router.push({ query: { ...this.$route.query, updated: this.dataset.id } })
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
