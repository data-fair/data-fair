<template>
  <v-stepper v-model="currentStep" class="elevation-0">
    <v-stepper-header>
      <v-stepper-step
        v-t="'stepFile'"
        :complete="!!file"
        step="1"
        editable
      />
      <v-divider />
      <v-stepper-step
        v-t="'stepAttachment'"
        :complete="currentStep > 2 && !!attachment"
        step="2"
      />
      <v-divider />
      <v-stepper-step v-t="'stepAction'" step="3" />
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p v-t="'loadMainFile'" />
        <div class="mt-3 mb-3">
          <v-file-input
            :label="$t('selectFile')"
            outlined
            dense
            style="max-width: 300px;"
            :accept="accepted.join(', ')"
            @change="onFileUpload"
          />
        </div>
        <div
          v-if="file"
          class="mt-3 mb-3"
        >
          <v-text-field
            v-model="title"
            name="title"
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
          @click.native="currentStep = 2"
        />

        <h3 v-t="'formats'" class="text-h6 mt-4" />
        <dataset-file-formats />
      </v-stepper-content>
      <v-stepper-content step="2">
        <p v-t="'attachmentsMsg1'" />
        <p v-t="'attachmentsMsg2'" />
        <div class="mt-3 mb-3">
          <v-file-input
            :label="$t('selectFile')"
            outlined
            dense
            style="max-width: 300px;"
            accept=".zip"
            @change="onAttachmentUpload"
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
          @click.native="currentStep = 3"
        />
      </v-stepper-content>
      <v-stepper-content step="3">
        <v-radio-group
          v-model="action"
          class="mt-3 mb-3"
          hide-details
        >
          <v-radio
            v-for="a in actions"
            :key="a.id"
            :label="a.title"
            :value="a"
          />
        </v-radio-group>
        <v-progress-linear
          v-if="importing"
          v-model="uploadProgress"
          class="mb-2"
        />
        <v-btn
          v-t="'import'"
          :disabled="!action || importing"
          color="primary"
          @click.native="importData()"
        />
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  stepFile: Sélection du fichier
  stepAttachment: Pièces jointes
  stepAction: Effectuer l'action
  loadMainFile: Chargez un fichier de données principal.
  selectFile: sélectionnez un fichier
  title: Titre du jeu de données
  titlePlaceholder: Laissez vide pour utiliser le nom de fichier
  continue: Continuer
  formats: Formats supportés
  attachmentsMsg1: Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.
  attachmentsMsg2: Le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
  attachmentsAsImage: Traiter les pièces jointes comme des images
  import: Lancer l'import
  createDataset: Créer un nouveau jeu de données
  updateDataset: Mettre à jour les données du jeu {title}
  fileTooLarge: Le fichier est trop volumineux pour être importé
  noSpaceLeft: Vous n'avez pas assez d'espace disponible pour ce fichier
  importError: "Erreur pendant l'import du fichier :"
en:
  stepFile: File selection
  stepAttachment: Attachments
  stepAction: Perform the action
  loadMainFile: Load the main data file
  selectFile: select a file
  title: Dataset title
  titlePlaceholder: Leave empty to use the file name
  continue: Continue
  formats: Supported formats
  attachmentsMsg1: Optionally you can load a zip archive containing files to be used as attachments to the lines of the main dataset file.
  attachmentsMsg2: The main data file must have a column that contains paths of the attachments in the archive.
  attachmentsAsImage: Process the attachments as images
  import: Proceed with importing data
  createDataset: Create a new dataset
  updateDataset: Update the data of the dataset {title}
  fileTooLarge: The file is too large to be imported
  noSpaceLeft: You don't have enough space left for this file
  importError: "Failure to import the file :"
</i18n>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      file: null,
      attachment: null,
      attachmentsAsImage: false,
      currentStep: null,
      uploadProgress: 0,
      actions: [],
      action: null,
      importing: false,
      title: '',
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env', 'accepted']),
      cleanTitle() {
        const trimmed = this.title.trim()
        return trimmed.length > 3 ? trimmed : null
      },
    },
    watch: {
      async currentStep() {
        if (this.currentStep === 3) {
          let existingDatasets
          if (this.cleanTitle) {
            existingDatasets = { results: [] }
          } else {
            existingDatasets = await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}` } })
          }
          this.actions = [{ type: 'create', title: this.$t('createDataset') }, ...existingDatasets.results.map(d => ({
            type: 'update',
            id: d.id,
            title: this.$t('updateDataset', { title: d.title }),
          }))]
          this.action = this.actions[0]
        }
      },
    },
    methods: {
      onFileUpload(file) {
        this.file = file
      },
      onAttachmentUpload(file) {
        this.attachment = file
      },
      async importData() {
        const options = {
          onUploadProgress: (e) => {
            if (e.lengthComputable) {
              this.uploadProgress = (e.loaded / e.total) * 100
            }
          },
          params: {},
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
          } else if (status === 429) {
            eventBus.$emit('notification', { type: 'error', msg: this.$t('noSpaceLeft') })
          } else {
            eventBus.$emit('notification', { error, msg: this.$t('importError') })
          }
          this.importing = false
        }
      },
    },
  }
</script>
