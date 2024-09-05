<template>
  <v-stepper
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
          editable
          :complete="!!fileDataset.initFrom"
        >
          {{ $t('stepInit') }}
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          :complete="!initFileFromData && !!file"
          :editable="!initFileFromData"
        >
          {{ $t('stepFile') }}
          <small
            v-if="file"
          >
            {{ file.name | truncate(30) }}
          </small>
        </v-stepper-step>
        <v-divider />
        <template v-if="$route.query.simple !== 'true'">
          <v-stepper-step
            v-if="$route.query.simple !== 'true'"
            :step="4"
            :complete="!initFileFromData && !!attachment"
            :editable="!initFileFromData && !!file"
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
          :step="$route.query.simple === 'true' ? 4 : 5"
          :editable="initFileFromData || !!file"
          :complete="fileParamsForm"
        >
          {{ $t('stepParams') }}
          <small
            v-if="fileParamsForm"
            v-t="'completed'"
          />
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="$route.query.simple === 'true' ? 5 : 6"
          :editable="fileParamsForm"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
      </template>

      <!-- REMOTE FILE steps -->
      <template v-if="datasetType === 'remoteFile'">
        <v-divider />
        <v-stepper-step
          :step="2"
          editable
          :complete="!!remoteFileDataset.initFrom"
        >
          {{ $t('stepInit') }}
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          editable
          :complete="remoteFileParamsForm"
        >
          {{ $t('stepParams') }}
          <small
            v-if="fileParamsForm"
            v-t="'completed'"
          />
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="4"
          :editable="remoteFileParamsForm"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
      </template>

      <!-- REST steps -->
      <template v-if="datasetType === 'rest'">
        <v-divider />
        <v-stepper-step
          :step="2"
          editable
          :complete="!!restDataset.initFrom"
        >
          {{ $t('stepInit') }}
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          editable
          :complete="restParamsForm"
        >
          {{ $t('stepParams') }}
          <small
            v-if="restParamsForm"
            v-t="'completed'"
          />
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="4"
          :editable="restParamsForm"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
      </template>

      <!-- VIRTUAL steps -->
      <template v-if="datasetType === 'virtual'">
        <v-divider />
        <v-stepper-step
          :step="2"
          editable
          :complete="virtualParamsForm"
        >
          {{ $t('stepParams') }}
          <small
            v-if="virtualParamsForm"
            v-t="'completed'"
          />
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          :editable="virtualParamsForm"
        >
          {{ $t('stepAction') }}
        </v-stepper-step>
      </template>

      <!-- META ONLY steps -->
      <template v-if="datasetType === 'metaOnly'">
        <v-divider />
        <v-stepper-step
          :step="2"
          editable
          :complete="metaParamsForm"
        >
          {{ $t('stepParams') }}
          <small
            v-if="metaParamsForm"
            v-t="'completed'"
          />
        </v-stepper-step>
        <v-divider />
        <v-stepper-step
          :step="3"
          :editable="metaParamsForm"
        >
          {{ $t('stepAction') }}
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
            width="300px"
            class="ma-1"
            outlined
            hover
            tile
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
              {{ $t('type_desc_' + type) }}
            </v-card-text>
          </v-card>
        </v-row>
      </v-stepper-content>

      <!-- FILE steps -->
      <template v-if="datasetType === 'file'">
        <v-stepper-content :step="2">
          <v-alert
            type="info"
            outlined
            dense
            style="max-width:440px;"
          >
            {{ $t('optionalStep') }}
          </v-alert>

          <dataset-init-from
            :dataset="fileDataset"
          />

          <v-btn
            v-t="fileDataset.initFrom ? 'continue' : 'ignorer'"
            color="primary"
            class="ml-2 mt-4"
            @click.native="currentStep = initFileFromData ? ($route.query.simple === 'true' ? 4 : 5) : 3"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
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
              style="max-width: 440px;"
              :accept="accepted.join(', ')"
              @change="() => {if (file && !suggestArchive) currentStep = 3}"
            />
          </div>
          <v-alert
            v-if="suggestArchive"
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
            @click.native="currentStep += 1"
          />

          <h3
            v-t="'formats'"
            class="text-h6 mt-4"
          />
          <dataset-file-formats />
        </v-stepper-content>

        <v-stepper-content
          v-if="$route.query.simple !== 'true'"
          step="4"
        >
          <v-alert
            type="info"
            outlined
            dense
            style="max-width:440px;"
          >
            {{ $t('optionalStep') }}
          </v-alert>
          <p v-t="'attachmentsMsg1'" />
          <div
            class="mt-3 mb-3"
            @drop.prevent="e => {attachment = e.dataTransfer.files[0]; currentStep = 4}"
            @dragover.prevent
          >
            <v-file-input
              v-model="attachment"
              :label="$t('selectArchive')"
              outlined
              dense
              style="max-width: 440px;"
              accept=".zip"
              hide-details
              clearable
              @change="() => {if (attachment) currentStep = 4}"
            />
          </div>
          <v-btn
            v-t="attachment ? 'continue' : 'ignore'"
            color="primary"
            class="mt-4"
            @click.native="currentStep += 1"
          />
        </v-stepper-content>

        <v-stepper-content :step="$route.query.simple === 'true' ? 4 : 5">
          <v-form v-model="fileParamsForm">
            <v-checkbox
              v-if="!initFileFromData && !!file"
              v-model="filenameTitle"
              name="filenameTitle"
              hide-details
              :label="$t('filenameTitle')"
              class="pl-2"
            />
            <v-text-field
              v-if="initFileFromData || !filenameTitle || !file"
              v-model="fileDataset.title"
              name="title"
              outlined
              dense
              hide-details
              :label="$t('title')"
              style="max-width: 440px"
              :rules="[val => val && val.length > 3]"
              class="pl-2 mt-5"
            />
            <v-checkbox
              v-if="attachment && !initFileFromData"
              v-model="fileDataset.attachmentsAsImage"
              :label="$t('attachmentsAsImage')"
              class="pl-2"
            />
          </v-form>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="ml-2 mt-4"
            :disabled="!fileParamsForm"
            @click.native="currentStep = $route.query.simple ? 5 : 6"
          />
        </v-stepper-content>

        <v-stepper-content :step="$route.query.simple === 'true' ? 5 : 6">
          <owner-pick
            v-model="fileDataset.owner"
            hide-single
            :restriction="[activeAccount]"
            message="Choisissez le propriétaire du nouveau jeu de données :"
          />
          <dataset-conflicts
            v-if="datasetType === 'file' && currentStep === ($route.query.simple === 'true' ? 5 : 6)"
            v-model="conflictsOk"
            :dataset="fileDataset"
            :file="file"
          />
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
              :color="$store.getters.readablePrimaryColor"
            >
              {{ file && file.name | truncate(30) }}
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
            :disabled="importing || !conflictsOk || !fileDataset.owner"
            color="primary"
            @click.native="createFileDataset()"
          />
        </v-stepper-content>
      </template>

      <!-- REMOTE FILE steps -->
      <template v-if="datasetType === 'remoteFile'">
        <v-stepper-content step="2">
          <v-alert
            type="info"
            outlined
            dense
            style="max-width:440px;"
          >
            {{ $t('optionalStep') }}
          </v-alert>

          <dataset-init-from
            :dataset="remoteFileDataset"
            :allow-data="false"
          />

          <v-btn
            v-t="remoteFileDataset.initFrom ? 'continue' : 'ignore'"
            color="primary"
            class="ml-2 mt-4"
            @click.native="currentStep += 1"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <p v-t="'remoteFileMessage'" />

          <v-form v-model="remoteFileParamsForm">
            <v-text-field
              v-model="remoteFileDataset.remoteFile.url"
              :label="$t('inputRemoteFile')"
              hide-details
              outlined
              dense
              style="max-width: 600px;"
              :rules="[val => val && val.startsWith('http://') || val.startsWith('https://')]"
            />
            <v-checkbox
              v-model="remoteFileDataset.remoteFile.autoUpdate.active"
              :label="$t('autoUpdate')"
              class="ml-2"
            />
            <v-text-field
              v-model="remoteFileDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 600px"
              :rules="[val => val && val.length > 3]"
            />
          </v-form>

          <v-btn
            v-t="'continue'"
            class="mt-2"
            :disabled="!remoteFileParamsForm"
            color="primary"
            @click.native="currentStep += 1"
          />

          <h3
            v-t="'formats'"
            class="text-h6 mt-4"
          />
          <dataset-file-formats />
        </v-stepper-content>

        <v-stepper-content step="4">
          <owner-pick
            v-model="remoteFileDataset.owner"
            hide-single
            :restriction="[activeAccount]"
            message="Choisissez le propriétaire du nouveau jeu de données :"
          />
          <dataset-conflicts
            v-if="datasetType === 'remoteFile' && currentStep === 4"
            v-model="conflictsOk"
            :dataset="remoteFileDataset"
          />
          <v-btn
            v-t="'import'"
            :disabled="!conflictsOk || !remoteFileDataset.owner"
            color="primary"
            @click.native="createDataset(remoteFileDataset)"
          />
        </v-stepper-content>
      </template>

      <!-- REST steps -->
      <template v-if="datasetType === 'rest'">
        <v-stepper-content step="2">
          <v-alert
            type="info"
            outlined
            dense
            style="max-width:440px;"
          >
            {{ $t('optionalStep') }}
          </v-alert>

          <dataset-init-from :dataset="restDataset" />

          <v-btn
            v-t="'continue'"
            color="primary"
            class="ml-2 mt-4"
            @click.native="currentStep += 1"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <v-form v-model="restParamsForm">
            <v-text-field
              v-model="restDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 440px"
              :rules="[val => val && val.length > 3]"
              class="mt-5"
            />

            <v-checkbox
              v-model="restDataset.rest.history"
              hide-details
              class="pl-2"
              :label="$t('history')"
            />

            <v-checkbox
              v-if="user.adminMode"
              v-model="restDataset.rest.lineOwnership"
              hide-details
              class="pl-2"
              :label="$t('lineOwnership')"
              background-color="admin"
              color="white"
              dark
            />
            <v-checkbox
              v-model="restDatasetAttachments"
              hide-details
              class="pl-2"
              :label="$t('attachments')"
            />
            <v-checkbox
              v-if="restDatasetAttachments"
              v-model="restDataset.attachmentsAsImage"
              hide-details
              class="pl-2"
              :label="$t('attachmentsAsImage')"
            />
          </v-form>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="ml-2 mt-4"
            :disabled="!restParamsForm"
            @click.native="currentStep += 1"
          />
        </v-stepper-content>

        <v-stepper-content step="4">
          <owner-pick
            v-model="restDataset.owner"
            hide-single
            :restriction="[activeAccount]"
            message="Choisissez le propriétaire du nouveau jeu de données :"
          />
          <dataset-conflicts
            v-if="datasetType === 'rest' && currentStep === 4"
            v-model="conflictsOk"
            :dataset="restDataset"
          />

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflictsOk || !restDataset.owner"
            color="primary"
            @click.native="createDataset(restDataset)"
          />
        </v-stepper-content>
      </template>

      <!-- VIRTUAL steps -->
      <template v-if="datasetType === 'virtual'">
        <v-stepper-content step="2">
          <v-form v-model="virtualParamsForm">
            <v-text-field
              v-model="virtualDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 440px"
              :rules="[val => val && val.length > 3]"
              class="mt-5"
            />
            <v-autocomplete
              v-model="virtualChildren"
              :items="childrenItems"
              :loading="loadingDatasets"
              :search-input.sync="search"
              hide-no-data
              item-text="title"
              item-value="id"
              :label="$t('children')"
              :placeholder="$t('search')"
              return-object
              outlined
              hide-details
              style="max-width: 500px"
              multiple
              :required="true"
              dense
              chips
              deletable-chips
              small-chips
              :rules="[value => !!(value && value.length) || '']"
              @change="datasets => {virtualDataset.virtual.children = datasets.map(d => d.id); fillVirtualDataset()}"
            >
              <template #item="{item}">
                <dataset-list-item
                  :dataset="item"
                  :dense="true"
                  :show-topics="true"
                  :no-link="true"
                  :checkbox="!!virtualDataset.virtual.children.find(d => d === item.id)"
                />
              </template>
            </v-autocomplete>
            <v-checkbox
              v-model="virtualDatasetFill"
              hide-details
              class="pl-2"
              :label="$t('virtualDatasetFill')"
              @change="fillVirtualDataset"
            />
          </v-form>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="ml-2 mt-4"
            :disabled="!virtualParamsForm"
            @click.native="currentStep = 3"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <owner-pick
            v-model="virtualDataset.owner"
            hide-single
            :restriction="[activeAccount]"
            message="Choisissez le propriétaire du nouveau jeu de données :"
          />
          <dataset-conflicts
            v-if="datasetType === 'virtual' && currentStep === 3"
            v-model="conflictsOk"
            :dataset="virtualDataset"
          />

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflictsOk || !virtualDataset.owner"
            color="primary"
            @click.native="createDataset(virtualDataset)"
          />
        </v-stepper-content>
      </template>

      <!-- META ONLY steps -->
      <template v-if="datasetType === 'metaOnly'">
        <v-stepper-content step="2">
          <v-form v-model="metaParamsForm">
            <v-text-field
              v-model="metaOnlyDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 440px"
              :rules="[val => val && val.length > 3]"
              class="pl-2 mt-5"
            />
          </v-form>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="ml-2 mt-4"
            :disabled="!metaParamsForm"
            @click.native="currentStep = 3"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <owner-pick
            v-model="metaOnlyDataset.owner"
            hide-single
            :restriction="[activeAccount]"
            message="Choisissez le propriétaire du nouveau jeu de données :"
          />
          <dataset-conflicts
            v-if="datasetType === 'metaOnly' && currentStep === 3"
            v-model="conflictsOk"
            :dataset="metaOnlyDataset"
          />

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflictsOk || !metaOnlyDataset.owner"
            color="primary"
            @click.native="createDataset(metaOnlyDataset)"
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
  home: Accueil
  choseType: Choisissez le type de jeu de données que vous souhaitez créer.
  type_file: Fichier
  type_desc_file: Chargez un fichier parmi les nombreux formats supportés.
  type_remoteFile: Fichier distant
  type_desc_remoteFile: Créez un jeu de données dont le contenu sera chargé à partir d'une URL.
  type_rest: Éditable
  type_desc_rest: Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.
  type_virtual: Virtuel
  type_desc_virtual: Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.
  type_metaOnly: Métadonnées seules
  type_desc_metaOnly: "Créez un pseudo jeu de données sans données locales, uniquement les autres informations (description, pièces jointes, etc)."
  stepFile: Sélection du fichier
  stepAttachment: Pièces jointes
  stepParams: Paramètres
  stepInit: Initialisation
  stepAction: Confirmation
  loadMainFile: Chargez un fichier de données principal.
  selectFile: sélectionnez ou glissez/déposez un fichier
  selectArchive: sélectionnez ou glissez/déposez une archive
  title: Titre du jeu de données
  filenameTitle: Utiliser le nom du fichier pour construire le titre du jeu de données
  continue: Continuer
  ignore: Ignorer
  formats: Formats supportés
  attachment: Document numérique attaché
  optionalStep: Cette étape est optionnelle
  attachmentsMsg1: Vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal. Dans ce cas le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
  attachments: Accepter des pièces jointes
  attachmentsAsImage: Traiter les pièces jointes comme des images
  import: Lancer l'import
  createDataset: Créer le jeu de données
  updateDataset: Mettre à jour les données du jeu {title}
  fileTooLarge: Le fichier est trop volumineux pour être importé
  importError: "Erreur pendant l'import du fichier :"
  creationError: "Erreur pendant la création du jeu de données :"
  cancel: Annuler
  cancelled: Chargement annulé par l'utilisateur
  suggestArchive: |
    Ce fichier est volumineux. Pour économiser du temps et de l'énergie vous pouvez si vous le souhaitez le charger sous forme compressée.
    <br>Pour ce faire vous devez créer soit un fichier "{name}.gz" soit une archive .zip contenant uniquement ce fichier.
  of: de
  history: Conserver un historique complet des révisions des lignes du jeu de données
  lineOwnership: Permet de donner la propriété d'une lignes à des utilisateurs (scénarios collaboratifs)
  children: Jeux enfants
  virtualDatasetFill: Initialiser le schéma avec toutes les colonnes des jeux enfants
  completed: complétés
  loaded: chargées
  masterData: Données de référence
  ownerDatasets: Vos jeux de données
  remoteFileMessage: Utilisez un lien vers un fichier dont le format est supporté.
  inputRemoteFile: URL du fichier distant
  autoUpdate: Activer la mise à jour automatique
en:
  datasetType: Dataset type
  newDataset: Create a dataset
  datasets: Datasets
  home: Home
  choseType: Chose the type of dataset you wish to create.
  type_file: File
  type_desc_file: Load a file among the many supported formats.
  type_remoteFile: Remote file
  type_desc_remoteFile: Create a dataset whose content will be loaded from an URL.
  type_rest: Editable
  type_desc_rest: Create a dataset whose content will be writable directly through a form.
  type_virtual: Virtual
  type_desc_virtual: Create a restricted virtual vue over one or more datasets.
  type_metaOnly: Metadata only
  type_desc_metaOnly: Create a pseudo dataset without any local data, only other information (description, attachments, etc).
  stepFile: File selection
  stepAttachment: Attachments
  stepParams: Parameters
  stepInit: Initialization
  stepAction: Confirmation
  loadMainFile: Load the main data file
  selectFile: select or drag and drop a file
  selectArchive: select or drag and drop an archive
  title: Dataset title
  filenameTitle: Use the file name to create the title of the dataset
  continue: Continue
  ignore: Ignore
  formats: Supported formats
  attachment: Attachment
  optionalStep: This step is optional
  attachmentsMsg1: You can load a zip archive containing files to be used as attachments to the lines of the main dataset file. In this case the main data file must have a column that contains paths of the attachments in the archive.
  attachments: Accept attachments
  attachmentsAsImage: Process the attachments as images
  import: Proceed with importing data
  createDataset: Create the dataset
  updateDataset: Update the data of the dataset {title}
  fileTooLarge: The file is too large to be imported
  importError: "Failure to import the file :"
  creationError: "Error while creating the dataset:"
  cancel: Cancel
  cancelled: Loading cancelled by user
  suggestArchive: |
    This file is large. To save and time and energy you can if you wish send a compressed version of it.
    <br>To do so you must create a file "{name}.gz" or a zip archive containing only this file.
  of: of
  history: Keep a full history of the revisions of the lines of the dataset
  lineOwnership: Accept giving ownership of lines to users (collaborative use-cases)
  children: Children datasets
  virtualDatasetFill: Initialize the schema with all columns from children
  completed: completed
  loaded: loaded
  masterData: Master data
  ownerDatasets: Your datasets
  autoUpdate: Activate auto-update
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'

export default {
  middleware: ['auth-required'],
  data: () => ({
    file: null,
    attachment: null,
    currentStep: 1,
    uploadProgress: { rate: 0 },
    importing: false,
    datasetTypeIcons: {
      file: 'mdi-file-upload',
      remoteFile: 'mdi-cloud-download',
      rest: 'mdi-all-inclusive',
      virtual: 'mdi-picture-in-picture-bottom-right-outline',
      metaOnly: 'mdi-information-variant'
    },
    datasetType: null,
    fileDataset: {
      title: '',
      attachmentsAsImage: false
    },
    remoteFileDataset: {
      title: '',
      remoteFile: {
        url: '',
        autoUpdate: {
          active: false
        }
      }
    },
    restDataset: {
      title: '',
      isRest: true,
      attachmentsAsImage: false,
      rest: {
        history: false,
        lineOwnership: false
      },
      schema: []
    },
    virtualDataset: {
      title: '',
      isVirtual: true,
      virtual: {
        children: []
      }
    },
    metaOnlyDataset: {
      isMetaOnly: true,
      title: ''
    },
    filenameTitle: true,
    fileParamsForm: false,
    remoteFileParamsForm: false,
    restParamsForm: false,
    virtualParamsForm: false,
    metaParamsForm: false,
    virtualChildren: [],
    restSource: null,
    restSourceExtensions: false,
    loadingDatasets: false,
    search: '',
    datasets: [],
    refDatasets: [],
    virtualDatasetFill: false,
    conflictsOk: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env', 'accepted']),
    datasetTypes () {
      return this.$route.query.simple === 'true' ? ['file', 'rest', 'metaOnly'] : ['file', 'remoteFile', 'rest', 'virtual', 'metaOnly']
    },
    restDatasetAttachments: {
      get () {
        return !!this.restDataset.schema.find(p => p['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      set (val) {
        if (val) {
          this.restDataset.schema.push({ key: 'attachmentPath', type: 'string', title: this.$t('attachment'), 'x-refersTo': 'http://schema.org/DigitalDocument' })
        } else {
          this.restDataset.schema = this.restDataset.schema.filter(p => p['x-refersTo'] !== 'http://schema.org/DigitalDocument')
        }
      }
    },
    childrenItems () {
      let items = []
      if (this.refDatasets.length) {
        items.push({ header: this.$t('masterData') })
        items = items.concat(this.refDatasets.filter(d => this.virtualChildren.find(c => c.id === d.id)))
        items = items.concat(this.refDatasets.filter(d => !this.virtualChildren.find(c => c.id === d.id)))
      }
      if (this.refDatasets.length && this.datasets.length) {
        items.push({ header: this.$t('ownerDatasets') })
      }
      items = items.concat(this.datasets.filter(d => this.virtualChildren.find(c => c.id === d.id)))
      items = items.concat(this.datasets.filter(d => !this.virtualChildren.find(c => c.id === d.id)))
      return items
    },
    suggestArchive () {
      return this.file && this.file.size > 50000000 && (this.file.name.endsWith('.csv') || this.file.name.endsWith('.tsv') || this.file.name.endsWith('.txt') || this.file.name.endsWith('.geojson'))
    },
    initFileFromData () {
      return this.fileDataset?.initFrom?.parts?.includes('data')
    }
  },
  watch: {
    search () {
      this.searchDatasets()
    }
  },
  created () {
    if (this.$route.query.simple === 'true') {
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('home'), to: '/' }, { text: this.$t('newDataset') }])
    } else {
      this.$store.dispatch('breadcrumbs', [{ text: this.$t('datasets'), to: '/datasets' }, { text: this.$t('newDataset') }])
    }
  },
  methods: {
    async createFileDataset () {
      this.cancelSource = this.$axios.CancelToken.source()
      const options = {
        onUploadProgress: (e) => {
          if (e.total) {
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
      if (!this.initFileFromData) {
        formData.append('dataset', this.file)
        if (this.attachment) {
          formData.append('attachments', this.attachment)
        } else {
          delete this.fileDataset.attachmentsAsImage
        }
        if (this.filenameTitle) delete this.fileDataset.title
      }
      formData.append('body', JSON.stringify(this.fileDataset))
      this.importing = true
      try {
        if (this.fileDataset.initFrom?.parts?.includes('schema') || this.file.size > 100000) options.params.draft = 'true'
        const dataset = await this.$axios.$post('api/v1/datasets', formData, options)
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
    },
    async createDataset (dataset) {
      const params = {}
      if (dataset.initFrom?.parts?.includes('schema')) params.draft = 'true'
      this.importing = true
      try {
        dataset = await this.$axios.$post('api/v1/datasets', dataset, { params })
        this.$router.push({ path: `/dataset/${dataset.id}` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        this.importing = false
      }
    },
    async searchDatasets () {
      this.loadingDatasets = true
      const remoteServicesRes = await this.$axios.$get('api/v1/remote-services', {
        params: { q: this.search, size: 1000, select: 'id,title,virtualDatasets', privateAccess: `${this.activeAccount.type}:${this.activeAccount.id}`, virtualDatasets: true }
      })
      this.refDatasets = remoteServicesRes.results.map(r => r.virtualDatasets.parent)

      const datasetsRes = await this.$axios.$get('api/v1/datasets', {
        params: { q: this.search, size: 20, select: 'id,title,schema,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner', owner: `${this.activeAccount.type}:${this.activeAccount.id}`, queryable: true }
      })

      this.datasets = datasetsRes.results
      this.loadingDatasets = false
    },
    async fillVirtualDataset () {
      this.virtualDataset.schema = []
      if (this.virtualDatasetFill) {
        for (const dataset of this.virtualChildren) {
          const schema = await this.$axios.$get(`api/v1/datasets/${dataset.id}/schema`)
          for (const property of schema) {
            if (!this.virtualDataset.schema.find(p => p.key === property.key)) {
              this.virtualDataset.schema.push(property)
            }
          }
        }
      }
    }
  }
}
</script>
