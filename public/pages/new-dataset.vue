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
          :complete="!!file"
          :editable="!!datasetType"
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
            :step="3"
            :complete="!!attachment"
            :editable="!!file"
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
          :step="$route.query.simple === 'true' ? 3 : 4"
          :editable="!!file"
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
          :step="$route.query.simple === 'true' ? 4 : 5"
          :editable="fileParamsForm"
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
          :step="3"
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
            @click.native="currentStep = 3"
          />

          <h3
            v-t="'formats'"
            class="text-h6 mt-4"
          />
          <dataset-file-formats />
        </v-stepper-content>

        <v-stepper-content
          v-if="$route.query.simple !== 'true'"
          step="3"
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
              @change="() => {if (attachment) currentStep = 4}"
            />
          </div>
          <v-btn
            v-t="'continue'"
            color="primary"
            class="mt-4"
            @click.native="currentStep = 4"
          />
        </v-stepper-content>

        <v-stepper-content :step="$route.query.simple === 'true' ? 3 : 4">
          <v-form v-model="fileParamsForm">
            <v-alert
              outlined
              type="warning"
              dense
              style="max-width:800px;"
            >
              {{ $t('titleId') }}
            </v-alert>
            <v-checkbox
              v-model="filenameTitle"
              name="filenameTitle"
              hide-details
              :label="$t('filenameTitle')"
              class="pl-2"
            />
            <v-text-field
              v-if="!filenameTitle"
              v-model="fileDataset.title"
              name="title"
              outlined
              dense
              hide-details
              :label="$t('title')"
              style="max-width: 400px"
              :rules="[val => val && val.length > 3]"
              class="pl-2 mt-5"
            />
            <v-checkbox
              v-if="attachment"
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
            @click.native="currentStep = $route.query.simple ? 4 : 5"
          />
        </v-stepper-content>

        <v-stepper-content :step="$route.query.simple === 'true' ? 4 : 5">
          <template v-if="conflicts && conflicts.length">
            <v-alert
              color="warning"
              outlined
              dense
              style="max-width:800px;"
              class="px-0 pb-0"
            >
              <span class="px-4">{{ $t('conflicts') }}</span>
              <v-list
                class="pb-0"
                color="transparent"
              >
                <v-list-item
                  v-for="(conflict,i) in conflicts"
                  :key="i"
                >
                  <v-list-item-content class="py-0">
                    <v-list-item-title>
                      <a
                        :href="$router.resolve(`/dataset/${conflict.dataset.id}`).href"
                        target="_blank"
                      >
                        {{ conflict.dataset.title }}
                      </a>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ $t('conflict_' + conflict.conflict) }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-alert>

            <v-checkbox
              v-model="ignoreConflicts"
              class="pl-2"
              :label="$t('ignoreConflicts')"
              color="warning"
              dense
            />
          </template>
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
            :disabled="importing || !conflicts || (!!conflicts.length && !ignoreConflicts)"
            color="primary"
            @click.native="createFileDataset()"
          />
        </v-stepper-content>
      </template>

      <!-- REST steps -->
      <template v-if="datasetType === 'rest'">
        <v-stepper-content step="2">
          <v-form v-model="restParamsForm">
            <v-alert
              outlined
              type="warning"
              dense
              style="max-width:800px;"
            >
              {{ $t('titleId') }}
            </v-alert>
            <v-text-field
              v-model="restDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 400px"
              :rules="[val => val && val.length > 3]"
              class="mt-5"
            />
            <dataset-select
              :label="$t('restSource')"
              :extra-params="{queryable: true}"
              @change="setRestSource"
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
            @click.native="currentStep = 3"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <template v-if="conflicts && conflicts.length">
            <v-alert
              color="warning"
              outlined
              dense
              style="max-width:800px;"
              class="px-0 pb-0"
            >
              <span class="px-4">{{ $t('conflicts') }}</span>
              <v-list
                class="pb-0"
                color="transparent"
              >
                <v-list-item
                  v-for="(conflict,i) in conflicts"
                  :key="i"
                >
                  <v-list-item-content class="py-0">
                    <v-list-item-title>
                      <a
                        :href="$router.resolve(`/dataset/${conflict.dataset.id}`).href"
                        target="_blank"
                      >
                        {{ conflict.dataset.title }}
                      </a>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ $t('conflict_' + conflict.conflict) }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-alert>

            <v-checkbox
              v-model="ignoreConflicts"
              class="pl-2"
              :label="$t('ignoreConflicts')"
              color="warning"
              dense
            />
          </template>

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflicts || (!!conflicts.length && !ignoreConflicts)"
            color="primary"
            @click.native="createDataset(restDataset)"
          />
        </v-stepper-content>
      </template>

      <!-- VIRTUAL steps -->
      <template v-if="datasetType === 'virtual'">
        <v-stepper-content step="2">
          <v-form v-model="virtualParamsForm">
            <v-alert
              outlined
              type="warning"
              dense
              style="max-width:800px;"
            >
              {{ $t('titleId') }}
            </v-alert>
            <v-text-field
              v-model="virtualDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 400px"
              :rules="[val => val && val.length > 3]"
              class="mt-5"
            />
            <v-autocomplete
              v-model="virtualChildren"
              :items="datasetsAndChildren"
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
                <v-checkbox
                  readonly
                  :value="!!virtualDataset.virtual.children.find(d => d === item.id)"
                />
                <dataset-list-item
                  :dataset="item"
                  :dense="true"
                  :show-topics="true"
                  :no-link="true"
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
          <template v-if="conflicts && conflicts.length">
            <v-alert
              color="warning"
              outlined
              dense
              style="max-width:800px;"
              class="px-0 pb-0"
            >
              <span class="px-4">{{ $t('conflicts') }}</span>
              <v-list
                class="pb-0"
                color="transparent"
              >
                <v-list-item
                  v-for="(conflict,i) in conflicts"
                  :key="i"
                >
                  <v-list-item-content class="py-0">
                    <v-list-item-title>
                      <a
                        :href="$router.resolve(`/dataset/${conflict.dataset.id}`).href"
                        target="_blank"
                      >
                        {{ conflict.dataset.title }}
                      </a>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ $t('conflict_' + conflict.conflict) }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-alert>

            <v-checkbox
              v-model="ignoreConflicts"
              class="pl-2"
              :label="$t('ignoreConflicts')"
              color="warning"
              dense
            />
          </template>

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflicts || (!!conflicts.length && !ignoreConflicts)"
            color="primary"
            @click.native="createDataset(virtualDataset)"
          />
        </v-stepper-content>
      </template>

      <!-- META ONLY steps -->
      <template v-if="datasetType === 'metaOnly'">
        <v-stepper-content step="2">
          <v-form v-model="metaParamsForm">
            <v-alert
              outlined
              type="warning"
              dense
              style="max-width:800px;"
            >
              {{ $t('titleId') }}
            </v-alert>
            <v-text-field
              v-model="metaOnlyDataset.title"
              name="title"
              outlined
              dense
              :label="$t('title')"
              style="max-width: 400px"
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
          <template v-if="conflicts && conflicts.length">
            <v-alert
              color="warning"
              outlined
              dense
              style="max-width:800px;"
              class="px-0 pb-0"
            >
              <span class="px-4">{{ $t('conflicts') }}</span>
              <v-list
                class="pb-0"
                color="transparent"
              >
                <v-list-item
                  v-for="(conflict,i) in conflicts"
                  :key="i"
                >
                  <v-list-item-content class="py-0">
                    <v-list-item-title>
                      <a
                        :href="$router.resolve(`/dataset/${conflict.dataset.id}`).href"
                        target="_blank"
                      >
                        {{ conflict.dataset.title }}
                      </a>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ $t('conflict_' + conflict.conflict) }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
            </v-alert>

            <v-checkbox
              v-model="ignoreConflicts"
              class="pl-2"
              :label="$t('ignoreConflicts')"
              color="warning"
              dense
            />
          </template>

          <v-btn
            v-t="'createDataset'"
            :disabled="importing || !conflicts || (!!conflicts.length && !ignoreConflicts)"
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
  type_rest: Éditable
  type_desc_rest: Créez un jeu de données dont le contenu sera saisissable directement avec un formulaire en ligne.
  type_virtual: Virtuel
  type_desc_virtual: Créez une vue virtuelle réduite sur un ou plusieurs jeux de données.
  type_metaOnly: Métadonnées seules
  type_desc_metaOnly: "Créez un pseudo jeu de données sans données locales, uniquement les autres informations (description, pièces jointes, etc)."
  stepFile: Sélection du fichier
  stepAttachment: Pièces jointes
  stepParams: Paramètres
  stepAction: Confirmation
  loadMainFile: Chargez un fichier de données principal.
  selectFile: sélectionnez ou glissez/déposez un fichier
  title: Titre du jeu de données
  titleId: Le titre du jeu de données sera utilisé pour construire un identifiant unique visible dans les URLs de pages de portails, les APIs, etc. Cet identifiant ne pourra pas être modifié.
  filenameTitle: Utiliser le nom du fichier pour construire le titre du jeu de données
  continue: Continuer
  formats: Formats supportés
  attachmentInfo: Cette étape est optionnelle
  attachmentsMsg1: Vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal.
  attachmentsMsg2: Le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
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
  conflicts: Doublons potentiels
  ignoreConflicts: Ignorer ces doublons potentiels
  conflict_filename: le nom de fichier est identique
  conflict_title: le titre est identique
  history: Conserver un historique complet des révisions des lignes du jeu de données
  lineOwnership: Permet de donner la propriété d'une lignes à des utilisateurs (scénarios collaboratifs)
  restSource: Initialiser le schéma en dupliquant celui d'un jeu de données existant
  children: Jeux enfants
  virtualDatasetFill: Initialiser le schéma avec toutes les colonnes des jeux enfants
  completed: complétés
  loaded: chargées
en:
  datasetType: Dataset type
  newDataset: Create a dataset
  datasets: Datasets
  home: Home
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
  stepParams: Parameters
  stepAction: Confirmation
  loadMainFile: Load the main data file
  selectFile: select or drag and drop a file
  title: Dataset title
  titleId: The title of the dataset will be used to create a unique id visible in URLs of portals pages, APIs, etc. This id cannot be changed.
  filenameTitle: Use the file name to create the title of the dataset
  continue: Continue
  formats: Supported formats
  attachmentInfo: This step is optional
  attachmentsMsg1: You can load a zip archive containing files to be used as attachments to the lines of the main dataset file.
  attachmentsMsg2: The main data file must have a column that contains paths of the attachments in the archive.
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
  conflicts: Potential duplicates
  ignoreConflits: Ignore these potentiel duplicates
  conflict_filename: the file name is the same
  conflict_title: the title is the same
  history: Keep a full history of the revisions of the lines of the dataset
  lineOwnership: Accept giving ownership of lines to users (collaborative use-cases)
  children: Children datasets
  virtualDatasetFill: Initialize the schema with all columns from children
  completed: completed
  loaded: loaded
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
    conflicts: [],
    importing: false,
    datasetTypeIcons: {
      file: 'mdi-file-upload',
      rest: 'mdi-all-inclusive',
      virtual: 'mdi-picture-in-picture-bottom-right-outline',
      metaOnly: 'mdi-information-variant'
    },
    datasetType: null,
    fileDataset: {
      title: '',
      attachmentsAsImage: false
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
    filenameTitle: false,
    fileParamsForm: false,
    restParamsForm: false,
    virtualParamsForm: false,
    metaParamsForm: false,
    ignoreConflicts: false,
    virtualChildren: [],
    restSource: null,
    loadingDatasets: false,
    search: '',
    datasets: [],
    virtualDatasetFill: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env', 'accepted']),
    datasetTypes () {
      return this.$route.query.simple === 'true' ? ['file', 'rest', 'metaOnly'] : ['file', 'rest', 'virtual', 'metaOnly']
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
    datasetsAndChildren () {
      return this.virtualChildren.concat(this.datasets.filter(d => !this.virtualChildren.find(c => c.id === d.id)))
    },
    suggestArchive () {
      return this.file && this.file.size > 50000000 && (this.file.name.endsWith('.csv') || this.file.name.endsWith('.tsv') || this.file.name.endsWith('.txt') || this.file.name.endsWith('.geojson'))
    }
  },
  watch: {
    async currentStep () {
      const conflicts = []
      if (this.datasetType === 'file' && this.currentStep === 5) {
        const datasetFilenameConflicts = (await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetFilenameConflicts) conflicts.push({ dataset, conflict: 'filename' })
        if (!this.filenameTitle) {
          const datasetTitleConflicts = (await this.$axios.$get('api/v1/datasets', { params: { title: this.fileDataset.title, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
          for (const dataset of datasetTitleConflicts) conflicts.push({ dataset, conflict: 'title' })
        }
      }
      if (this.datasetType === 'rest' && this.currentStep === 3) {
        const datasetTitleConflicts = (await this.$axios.$get('api/v1/datasets', { params: { title: this.restDataset.title, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetTitleConflicts) conflicts.push({ dataset, conflict: 'title' })
      }
      if (this.datasetType === 'virtual' && this.currentStep === 3) {
        const datasetTitleConflicts = (await this.$axios.$get('api/v1/datasets', { params: { title: this.virtualDataset.title, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetTitleConflicts) conflicts.push({ dataset, conflict: 'title' })
      }
      if (this.datasetType === 'metaOnly' && this.currentStep === 3) {
        const datasetTitleConflicts = (await this.$axios.$get('api/v1/datasets', { params: { title: this.metaOnlyDataset.title, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetTitleConflicts) conflicts.push({ dataset, conflict: 'title' })
      }
      this.conflicts = conflicts
    },
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
      } else {
        delete this.fileDataset.attachmentsAsImage
      }
      if (this.filenameTitle) delete this.fileDataset.title
      formData.append('body', JSON.stringify(this.fileDataset))
      this.importing = true
      try {
        if (this.file.size > 100000) options.params.draft = 'true'
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
      this.importing = true
      try {
        dataset = await this.$axios.$post('api/v1/datasets', dataset)
        this.$router.push({ path: `/dataset/${dataset.id}` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('creationError') })
        this.importing = false
      }
    },
    async searchDatasets () {
      this.loadingDatasets = true
      const res = await this.$axios.$get('api/v1/datasets', {
        params: { q: this.search, size: 20, select: 'id,title,schema,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner', owner: `${this.activeAccount.type}:${this.activeAccount.id}`, queryable: true }
      })
      this.datasets = res.results
      this.loadingDatasets = false
    },
    fillVirtualDataset () {
      this.virtualDataset.schema = []
      if (this.virtualDatasetFill) {
        for (const dataset of this.virtualChildren) {
          for (const property of dataset.schema) {
            if (!this.virtualDataset.schema.find(p => p.key === property.key)) {
              this.virtualDataset.schema.push(property)
            }
          }
        }
      }
    },
    async setRestSource (dataset) {
      if (!dataset) this.restDataset.schema = []
      else this.restDataset.schema = (await this.$axios.$get('api/v1/datasets/' + dataset.id)).schema
    }
  }
}
</script>
