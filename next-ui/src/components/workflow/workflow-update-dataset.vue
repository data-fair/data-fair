<!-- eslint-disable vue/no-v-html -->
<!-- eslint-disable vue/no-v-text-v-html-on-component -->
<template>
  <v-stepper
    v-model="currentStep"
    class="elevation-0 bg-background"
  >
    <v-stepper-header class="bg-surface">
      <v-stepper-item
        :value="1"
        :complete="!!currentDataset"
        editable
        color="primary"
        :title="t('stepDataset')"
        :subtitle="currentDataset ? truncateMiddle(currentDataset.title, 26, 4, '...') : undefined"
      />

      <!-- FILE steps -->
      <template v-if="!!currentDataset?.file">
        <v-divider />
        <v-stepper-item
          :value="2"
          :complete="!!file"
          editable
          color="primary"
          :title="t('stepFile')"
          :subtitle="file && truncateMiddle(file.name, 26, 4, '...')"
        />
        <v-divider />

        <template v-if="digitalDocumentField">
          <v-stepper-item
            :value="3"
            :complete="!!attachments"
            editable
            color="primary"
            :title="t('stepAttachment')"
            :subtitle="attachments && t('loaded')"
          />
          <v-divider />
        </template>

        <v-stepper-item
          :value="digitalDocumentField ? 4 : 3"
          :complete="!!imported"
          :editable="!!file"
          color="primary"
          :title="t('stepAction')"
        />
        <v-divider />

        <v-stepper-item
          :value="digitalDocumentField ? 5 : 4"
          :editable="!!imported"
          color="primary"
          :title="t('stepReview')"
        />
      </template>

      <!-- REST steps -->
      <template v-if="currentDataset?.isRest">
        <v-divider />
        <v-stepper-item
          :value="2"
          :editable="!!currentDataset"
          color="primary"
          :title="t('editTable')"
        />
      </template>
    </v-stepper-header>

    <v-stepper-window class="mx-0 mb-0 mt-2">
      <v-stepper-window-item :value="1">
        <v-row
          v-if="!initialFetch"
          class="mt-4 mb-1 mx-0"
        >
          <dataset-select-cards
            v-model="selectedDataset"
            :extra-params="datasetsFilter"
          />
        </v-row>
      </v-stepper-window-item>

      <dataset-store-provider
        v-if="currentDatasetId"
        :id="currentDatasetId"
        :key="currentDatasetId"
        ref="dataset-store-provider"
        v-slot="{ datasetStore }"
        journal
        task-progress
        watch
        draft-mode
        html
      >
        <v-alert
          v-if="currentDataset && missingPermissions.length"
          variant="outlined"
          type="error"
          class="ma-4"
        >
          {{ t('missingPermissions') }}
          <ul
            style="list-style-type: disc;"
          >
            <li
              v-for="p of missingPermissions"
              :key="p"
            >
              {{ t('permissions.' + p) }}
            </li>
          </ul>
        </v-alert>
        <!-- FILE steps -->
        <template v-else>
          <template v-if="currentDataset?.file">
            <v-stepper-window-item
              :value="2"
              class="pa-6"
            >
              <p>
                {{ t('loadMainFile') }}
              </p>
              <div
                class="mt-3 mb-3"
                @drop.prevent="e => {file = e.dataTransfer?.files[0]; if (!suggestArchive) currentStep = 3}"
                @dragover.prevent
              >
                <v-file-input
                  v-model="file"
                  :label="t('selectFile')"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="max-width: 400px;"
                  :accept="accepted.join(', ')"
                  @change="currentStep = 3"
                />
              </div>
              <v-alert
                v-if="file && file.size > 50000000 && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt') || file.name.endsWith('.geojson'))"
                variant="outlined"
                type="info"
                density="compact"
                v-html="t('suggestArchive', {name: file.name})"
              />
              <v-btn
                class="mt-2"
                :disabled="!file"
                color="primary"
                @click="currentStep = 3"
              >
                {{ t('continue') }}
              </v-btn>

              <h3
                class="text-h6 mt-4"
              >
                {{ t('formats') }}
              </h3>
              <dataset-file-formats />
            </v-stepper-window-item>

            <v-stepper-window-item
              v-if="digitalDocumentField"
              :value="3"
              class="pa-6"
            >
              <v-alert
                type="info"
                variant="outlined"
                density="compact"
                style="max-width:400px;"
              >
                {{ t('attachmentInfo') }}
              </v-alert>
              <p>
                {{ t('attachmentsMsg1') }}
              </p>

              <p>
                {{ t('attachmentsMsg2') }}
              </p>
              <div
                class="mt-3 mb-3"
                @drop.prevent="e => {attachments = e.dataTransfer?.files[0]; currentStep = 5}"
                @dragover.prevent
              >
                <v-file-input
                  v-model="attachments"
                  :label="t('selectFile')"
                  variant="outlined"
                  density="compact"
                  style="max-width: 400px;"
                  accept=".zip"
                  hide-details
                  clearable
                  @change="currentStep = 5"
                />
              </div>
              <v-btn
                color="primary"
                class="mt-4"
                @click="currentStep = 5"
              >
                {{ t('continue') }}
              </v-btn>
            </v-stepper-window-item>

            <v-stepper-window-item
              :value="digitalDocumentField ? 4 : 3"
              class="pa-6"
            >
              <template v-if="file">
                <p class="mb-3">
                  {{ t('updateMsg') }}
                </p>
                <v-row
                  v-if="updateDataset.loading.value"
                  class="mx-0 my-3"
                >
                  <v-progress-linear
                    v-if="uploadProgress"
                    v-model="uploadProgress.percent"
                    class="my-1"
                    rounded
                    height="28"
                    color="primary"
                    style="max-width: 600px;"
                  >
                    {{ truncateMiddle(file.name, 36, 4, '...') }}
                    <template v-if="uploadProgress.total && uploadProgress.percent !== undefined">
                      {{ Math.floor(uploadProgress.percent) }}% {{ t('of') }} {{ formatBytes(uploadProgress.total, locale) }}
                    </template>
                  </v-progress-linear>
                  <v-btn
                    :icon="mdiCancel"
                    color="warning"
                    density="compact"
                    class="mt-1 ml-2"
                    :title="t('cancel')"
                    @click="cancelUpdateDataset"
                  />
                </v-row>
                <v-btn
                  color="primary"
                  :disabled="updateDataset.loading.value"
                  @click="updateDataset.execute()"
                >
                  {{ t('update') }}
                </v-btn>
              </template>
            </v-stepper-window-item>

            <v-stepper-window-item :value="digitalDocumentField ? 5 : 4">
              <template v-if="imported">
                <div class="mx-4 mb-4">
                  <journal-view
                    v-if="datasetStore.journal.value"
                    :journal="datasetStore.journal.value"
                    :after="imported"
                    :task-progress="datasetStore.taskProgress.value"
                    type="dataset"
                  />
                </div>
                <v-alert
                  v-if="draftCancelledEvent"
                  type="error"
                  variant="outlined"
                  class="mx-4"
                >
                  {{ t('draftCancelled') }}
                  <template #append>
                    <v-btn
                      color="warning"
                      variant="flat"
                      @click="currentStep = 2"
                    >
                      changer de fichier
                    </v-btn>
                  </template>
                </v-alert>
                <v-card
                  v-else-if="datasetStore.dataset.value?.finalizedAt && imported < datasetStore.dataset.value?.finalizedAt"
                  class="mx-4 mb-4 pt-1"
                >
                  <dataset-table
                    :height="Math.max(500, height - 360)"
                  />
                </v-card>
              </template>
            </v-stepper-window-item>
          </template>

          <!-- REST steps -->
          <template v-if="datasetStore.dataset.value?.isRest">
            <v-stepper-window-item :value="2">
              <dataset-table
                :edit="true"
                :height="height - 84"
              />
            </v-stepper-window-item>
          </template>
        </template>
      </dataset-store-provider>
    </v-stepper-window>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  updateDataset: Mettre à jour un jeu de données
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
  similarDatasets: "Ce jeu de données a le même nom de fichier : | Ces jeux de données ont le même nom de fichier :"
  updateMsg: Après la soumission vous pourrez observer les changements et vous serez averti si il y a un risque d'incompatibilité.
  update: Mettre à jour
  loaded: chargées
  editTable: Édition des lignes
  datasetsCount: "Vous ne pouvez mettre à jour aucun jeu de données | Vous pouvez mettre à jour 1 jeu de données | Vous pouvez mettre à jour {count} jeux de données"
  missingPermissions: "Vous semblez pouvoir charger des données sur ce jeu de données, mais il vous manque une partie des permissions nécessaires au fonctionnement complet de cette page. Permissions manquantes :"
  permissions:
    readJournal: Lister les événements du journal du jeu de données.
    readLines: Requêter les lignes du jeu de données.
  draftCancelled: Votre fichier a été rejeté automatiquement. Vous pouvez corriger un problème de structure dans le fichier avant de le charger de nouveau, ou contacter un administrateur.
en:
  updateDataset: Update a dataset
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
  similarDatasets: "This dataset has the same file name: | These datasets have the same file name:"
  updateMsg: After submitting you will be be able to review the changes and you will be warned if there is an incompatibility.
  update: Update
  loaded: loaded
  editTable: Edit lines
  datasetsCount: "You can't update any dataset | You can update 1 dataset | You can update {count} datasets"
  missingPermissions: "You seem to be able to load data on this dataset, but you lack some of the permissions necessary for this page. Missing permissions:"
  permissions:
    readJournal: List the events of the dataset's log
    readLines: Query the dataset's lines
  draftCancelled: Your file was rejected. You can fix a structure problem in the file before loading it again, or contact an administrator.
</i18n>

<script lang="ts" setup>
import truncateMiddle from 'truncate-middle'
import { accepted } from '~/utils/dataset'
import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import { type ListedDataset } from '../dataset/select/utils'
import { type DatasetStore } from '~/composables/dataset-store'
import DatasetStoreProvider from '~/components/provide/dataset-store-provider.vue'
import Debug from 'debug'
import { mdiCancel } from '@mdi/js'
import { useWindowSize } from '@vueuse/core'

const debug = Debug('workflow-update-dataset')

const { datasetParams } = defineProps({
  datasetParams: { type: Object as () => Record<string, string | undefined>, default: () => {} }
})
// const updated = defineModel('updated', { type: String })

const { sendUiNotif } = useUiNotif()
const { t, locale } = useI18n()
const { height } = useWindowSize()

const currentStep = ref(1)

const file = ref<File>()
const attachments = ref<File>()

const suggestArchive = computed(() => file.value && file.value.size > 50000000 && (file.value.name.endsWith('.csv') || file.value.name.endsWith('.tsv') || file.value.name.endsWith('.txt') || file.value.name.endsWith('.geojson')))

const datasetsFilter = computed(() => ({
  ...datasetParams,
  type: 'file,rest',
  can: 'writeData,createLine,updateLine'
}))

const selectedDataset = ref<ListedDataset>()
// const currentDatasetId = ref(updated.value)
const currentDatasetId = ref<string>()
watch(selectedDataset, () => {
  debug('selectedDataset', selectedDataset.value)
  if (selectedDataset.value) {
    currentDatasetId.value = selectedDataset.value.id
    /* if (selectedDataset.value.isRest) {
      updated.value = selectedDataset.value.id
    } else {
      updated.value = undefined
    } */
  }
})
watch(currentStep, () => {
  debug('step change', currentStep.value)
  if (!initialized.value) return
  if (currentStep.value === 1) {
    selectedDataset.value = undefined
    currentDatasetId.value = undefined
  }
})

const datasetStoreProvider = useTemplateRef<typeof DatasetStoreProvider>('dataset-store-provider')
const currentDatasetStore = computed(() => {
  return datasetStoreProvider.value?.datasetStore as DatasetStore | null
})
const currentDataset = computed(() => currentDatasetStore.value?.dataset?.value)
const initialized = computed((oldValue) => {
  if (oldValue) return true
  // if (!updated.value) return true
  return !!currentDataset?.value
})
// const initialFetch = ref(!!updated.value)
const initialFetch = false
const missingPermissions = computed(() => {
  return ['readJournal', 'readLines'].filter(p => !currentDataset.value?.userPermissions.includes(p))
})
const draftCancelledEvent = computed(() => {
  const importedAt = imported.value
  if (!importedAt) return undefined
  return currentDatasetStore.value?.journal.value?.find(e => e.type === 'draft-cancelled' && imported && e.date > importedAt)
})

watch(currentDataset, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    /* if (initialFetch.value && currentDataset.value?.file) {
      currentStep.value = digitalDocumentField.value ? 5 : 4
      imported.value = true
    } else {
      currentStep.value = 2
    }
    initialFetch.value = false
    */
    currentStep.value = 2
  }
})
const digitalDocumentField = computed(() => currentDatasetStore.value?.digitalDocumentField.value)

// watch(dataset, () => {
//   if (!dataset.value) return
//   /* if (dataset.value.isRest) {
//     datasetType.value = 'rest'
//     currentStep.value = 3
//   } else {
//     datasetType.value = 'file'
//     currentStep.value = (dataset.value && digitalDocumentField.value) ? 6 : 5
//   } */
//   currentStep.value = 2
// })

let cancelUpdate: CancelTokenSource
const uploadProgress = ref<{ loaded: number, total?: number, percent?: number }>()
const imported = ref<string>()

const updateDataset = useAsyncAction(async () => {
  if (!file.value) return
  if (!currentDataset.value) return
  cancelUpdate = axios.CancelToken.source()
  const options: AxiosRequestConfig = {
    onUploadProgress: (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = {
          loaded: e.loaded,
          total: e.total,
          percent: e.total && ((e.loaded / e.total) * 100)
        }
      }
    },
    cancelToken: cancelUpdate.token,
    params: { draft: 'compatibleOrCancel' }
  }
  const formData = new FormData()
  formData.append('dataset', file.value)
  if (attachments.value) {
    formData.append('attachments', attachments.value)
  }
  try {
    const res = await axios.post(`${$apiPath}/datasets/` + currentDataset.value.id, formData, options)
    imported.value = res.data.updatedAt
    currentStep.value += 1
    // updated.value = currentDataset.value.id
  } catch (error: any) {
    const status = error.response && error.response.status
    if (status === 413) {
      sendUiNotif({ type: 'error', msg: t('fileTooLarge') })
    } else {
      sendUiNotif({ type: 'error', msg: t('importError') })
    }
  }
})

const cancelUpdateDataset = () => {
  if (!cancelUpdate) return
  cancelUpdate.cancel(t('cancelled'))
}

/*
export default {
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
  },
  watch: {
    '$route.query.updated' () {
      // updated from parent window
      if (this.dataset && !this.$route.query.updated) window.location.reload()
    }
  },
  async created () {
    this.$store.dispatch('dataset/clear')
    this.$store.dispatch('breadcrumbs', [{ text: this.t('home'), to: '/' }, { text: this.t('updateDataset') }])

    this.datasetsCount.file = (await this.$axios.$get('api/v1/datasets', { params: { size: 0, ...file.valueDatasetsFilter } })).count
    this.datasetsCount.rest = (await this.$axios.$get('api/v1/datasets', { params: { size: 0, ...this.restDatasetsFilter } })).count
    if (this.$route.query.updated) {
      await this.$store.dispatch('dataset/setId', { datasetId: this.$route.query.updated, draftMode: true })
      this.$store.dispatch('dataset/subscribe')
      this.imported = true
      if (this.dataset.isRest) {
        this.datasetType = 'rest'
        this.currentStep = 3
      } else {
        this.datasetType = 'file'
        this.currentStep = (this.dataset && this.digitalDocumentField) ? 6 : 5
      }
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
        if (this.$route.query.updated) {
          const query = { ...this.$route.query }
          delete query.updated
          this.$router.push({ query })
        }
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
      formData.append('dataset', file.value)
      if (this.attachment) {
        formData.append('attachments', this.attachment)
      }
      this.importing = true
      try {
        if (file.value.size > 100000) options.params.draft = 'true'
        await this.$axios.$post('api/v1/datasets/' + this.dataset.id, formData, options)
        this.imported = true
        this.currentStep += 1
        this.$router.push({ query: { ...this.$route.query, updated: this.dataset.id } })
      } catch (error) {
        const status = error.response && error.response.status
        if (status === 413) {
          eventBus.$emit('notification', { type: 'error', msg: this.t('fileTooLarge') })
        } else {
          eventBus.$emit('notification', { error, msg: this.t('importError') })
        }
        this.importing = false
      }
    },
    cancel () {
      if (this.cancelSource) this.cancelSource.cancel(this.t('cancelled'))
    }
  }
} */
</script>
