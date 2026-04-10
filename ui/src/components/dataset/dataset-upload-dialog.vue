<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
    persistent
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card :title="t('title')">
      <v-card-text>
        <v-stepper
          v-model="step"
          class="bg-background"
          flat
        >
          <v-stepper-header class="bg-surface">
            <v-stepper-item
              :value="1"
              :complete="!!file"
              :editable="true"
              :color="step === 1 ? 'primary' : ''"
              :icon="mdiPaperclip"
              :title="t('stepFile')"
            />
            <v-divider />
            <v-stepper-item
              :value="2"
              :complete="step > 2"
              :editable="!!file"
              :color="step === 2 ? 'primary' : ''"
              :icon="mdiCog"
              :title="t('stepOptions')"
            />
            <v-divider />
            <v-stepper-item
              :value="3"
              :editable="step > 2"
              :color="step === 3 ? 'primary' : ''"
              :icon="mdiUpload"
              :title="t('stepUpload')"
            />
          </v-stepper-header>

          <v-stepper-window>
            <!-- Step 1: File selection -->
            <v-stepper-window-item :value="1">
              <p class="text-body-large mb-4">
                {{ t('selectFileMsg') }}
              </p>
              <v-file-input
                v-model="fileInputValue"
                :label="t('selectFile')"
                variant="outlined"
                density="compact"
                hide-details
                max-width="500"
                prepend-icon=""
                :prepend-inner-icon="mdiPaperclip"
                @update:model-value="onFileChange"
              />
              <v-file-input
                v-model="attachmentsInputValue"
                :label="t('selectAttachments')"
                variant="outlined"
                density="compact"
                hide-details
                accept=".zip"
                class="mt-4"
                max-width="500"
                prepend-icon=""
                :prepend-inner-icon="mdiZipBox"
                clearable
              />
              <div class="mt-6">
                <v-btn
                  color="primary"
                  :disabled="!file"
                  @click="step = 2"
                >
                  {{ t('continue') }}
                </v-btn>
              </div>
            </v-stepper-window-item>

            <!-- Step 2: Options -->
            <v-stepper-window-item :value="2">
              <p class="text-body-large mb-4">
                {{ t('optionsMsg') }}
              </p>
              <v-select
                v-if="isTextFile"
                v-model="encoding"
                :items="encodingOptions"
                :label="t('encoding')"
                variant="outlined"
                density="compact"
                max-width="400"
                class="mb-4"
              />
              <v-select
                v-model="escapeKeyAlgorithm"
                :items="escapeKeyOptions"
                :label="t('escapeKeyAlgorithm')"
                variant="outlined"
                density="compact"
                max-width="400"
              />
            </v-stepper-window-item>

            <!-- Step 3: Upload -->
            <v-stepper-window-item :value="3">
              <v-alert
                v-if="upload.error.value"
                type="error"
                class="mb-4"
                style="max-width: 500px;"
              >
                {{ upload.error.value }}
              </v-alert>
              <v-list
                v-if="file"
                density="compact"
                class="mb-4"
                style="max-width: 500px;"
              >
                <v-list-item>
                  <template #prepend>
                    <v-icon :icon="mdiFile" />
                  </template>
                  <v-list-item-title>{{ file.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ formatBytes(file.size, locale) }}</v-list-item-subtitle>
                </v-list-item>
                <v-list-item v-if="attachments">
                  <template #prepend>
                    <v-icon :icon="mdiZipBox" />
                  </template>
                  <v-list-item-title>{{ attachments.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ formatBytes(attachments.size, locale) }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <v-row
                v-if="upload.loading.value"
                class="my-2"
                align="center"
              >
                <v-progress-linear
                  v-model="uploadPercent"
                  class="my-1"
                  rounded
                  height="28"
                  color="primary"
                  style="max-width: 500px;"
                >
                  <template v-if="uploadProgress.total && uploadPercent !== undefined">
                    {{ Math.floor(uploadPercent) }}% {{ t('of') }} {{ formatBytes(uploadProgress.total, locale) }}
                  </template>
                </v-progress-linear>
                <v-btn
                  :icon="mdiCancel"
                  color="warning"
                  density="compact"
                  variant="text"
                  class="ml-2"
                  :title="t('cancel')"
                  @click="cancelUpload"
                />
              </v-row>
            </v-stepper-window-item>
          </v-stepper-window>

          <v-stepper-actions
            v-if="step > 1"
            :prev-text="t('back')"
            class="justify-start ga-2"
            @click:prev="goToPrev"
          >
            <template #next>
              <v-btn
                color="primary"
                variant="flat"
                :disabled="!isNextEnabled"
                :loading="upload.loading.value"
                @click="goToNext"
              >
                {{ nextButtonText }}
              </v-btn>
            </template>
          </v-stepper-actions>
        </v-stepper>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="upload.loading.value"
          @click="showDialog = false"
        >
          {{ t('close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Mettre à jour le fichier de données
  stepFile: Fichier
  stepOptions: Options
  stepUpload: Import
  selectFileMsg: Sélectionnez un nouveau fichier de données à charger.
  selectFile: Sélectionnez ou glissez/déposez un fichier
  selectAttachments: Pièces jointes (archive zip, optionnel)
  optionsMsg: Configurez les options avancées si nécessaire.
  encoding: Encodage du fichier
  escapeKeyAlgorithm: Algorithme de normalisation des clés
  continue: Continuer
  back: Retour
  upload: Lancer l'import
  close: Fermer
  cancel: Annuler
  of: de
  uploadSuccess: Fichier chargé avec succès
  uploadError: "Erreur pendant le chargement du fichier"
  fileTooLarge: Le fichier est trop volumineux pour être importé
en:
  title: Update data file
  stepFile: File
  stepOptions: Options
  stepUpload: Upload
  selectFileMsg: Select a new data file to upload.
  selectFile: Select or drag and drop a file
  selectAttachments: Attachments (zip archive, optional)
  optionsMsg: Configure advanced options if needed.
  encoding: File encoding
  escapeKeyAlgorithm: Key normalization algorithm
  continue: Continue
  back: Back
  upload: Proceed with upload
  close: Close
  cancel: Cancel
  of: of
  uploadSuccess: File uploaded successfully
  uploadError: "Error uploading file"
  fileTooLarge: The file is too large to be imported
</i18n>

<script setup lang="ts">
import {
  mdiCancel,
  mdiCog,
  mdiFile,
  mdiPaperclip,
  mdiUpload,
  mdiZipBox
} from '@mdi/js'
import axios, { type AxiosRequestConfig, type CancelTokenSource } from 'axios'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import useDatasetStore from '~/composables/dataset/dataset-store'

const { t, locale } = useI18n()
const { sendUiNotif } = useUiNotif()
const { id: datasetId, datasetFetch } = useDatasetStore()

const showDialog = ref(false)
const step = ref(1)
const fileInputValue = ref<File[]>([])
const attachmentsInputValue = ref<File[]>([])
const file = ref<File | null>(null)
const attachments = computed(() => attachmentsInputValue.value?.[0] ?? null)
const encoding = ref('UTF-8')
const escapeKeyAlgorithm = ref('slug')

const encodingOptions = [
  { title: 'UTF-8', value: 'UTF-8' },
  { title: 'ISO-8859-1 (Latin-1)', value: 'ISO-8859-1' },
  { title: 'Windows-1252', value: 'Windows-1252' }
]

const escapeKeyOptions = [
  { title: 'slug', value: 'slug' },
  { title: 'compat-ods', value: 'compat-ods' }
]

const isTextFile = computed(() => {
  if (!file.value) return false
  const name = file.value.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')
})

function onFileChange (val: File | File[]) {
  if (Array.isArray(val)) {
    file.value = val[0] ?? null
  } else {
    file.value = val ?? null
  }
  if (file.value) {
    step.value = 2
  }
}

// Reset state when dialog opens
watch(showDialog, (val) => {
  if (val) {
    step.value = 1
    fileInputValue.value = []
    attachmentsInputValue.value = []
    file.value = null
    encoding.value = 'UTF-8'
    escapeKeyAlgorithm.value = 'slug'
    uploadProgress.value = { loaded: 0 }
  }
})

let cancelSource: CancelTokenSource
const uploadProgress = ref<{ loaded: number, total?: number }>({ loaded: 0 })
const uploadPercent = computed(() => {
  if (!uploadProgress.value.total) return 0
  return (uploadProgress.value.loaded / uploadProgress.value.total) * 100
})

const upload = useAsyncAction(async () => {
  if (!file.value) return
  cancelSource = axios.CancelToken.source()
  const options: AxiosRequestConfig = {
    onUploadProgress: (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = {
          loaded: e.loaded,
          total: e.total
        }
      }
    },
    cancelToken: cancelSource.token,
    params: {} as Record<string, string>
  }

  // Use draft mode for files > 100KB
  if (file.value.size > 100000) {
    options.params.draft = 'true'
  }

  const formData = new FormData()
  formData.append('dataset', file.value)
  if (attachments.value) {
    formData.append('attachments', attachments.value)
  }

  const body: Record<string, string> = {}
  if (escapeKeyAlgorithm.value !== 'slug') {
    body.escapeKeyAlgorithm = escapeKeyAlgorithm.value
  }
  if (Object.keys(body).length) {
    formData.append('body', JSON.stringify(body))
  }

  if (isTextFile.value && encoding.value !== 'UTF-8') {
    formData.append('dataset_encoding', encoding.value)
  }

  try {
    await axios.post(`${$apiPath}/datasets/${datasetId}`, formData, options)
    showDialog.value = false
    datasetFetch.refresh()
    sendUiNotif({ type: 'success', msg: t('uploadSuccess') })
  } catch (error: any) {
    const status = error.response && error.response.status
    if (status === 413) {
      sendUiNotif({ type: 'error', msg: t('fileTooLarge') })
    } else {
      throw error
    }
  }
})

const cancelUpload = () => {
  cancelSource?.cancel(t('cancel'))
}

const isNextEnabled = computed(() => {
  if (step.value === 1) return !!file.value
  if (step.value === 2) return true
  if (step.value === 3) return !!file.value && !upload.loading.value
  return false
})

const nextButtonText = computed(() => {
  if (step.value === 3) return t('upload')
  return t('continue')
})

function goToPrev () {
  if (step.value > 1) {
    step.value -= 1
  }
}

async function goToNext () {
  if (step.value === 3) {
    await upload.execute()
  } else {
    step.value += 1
  }
}
</script>
