<template>
  <v-dialog
    v-model="showDialog"
    max-width="600"
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
        <v-file-input
          v-model="fileInputValue"
          :label="t('selectFile')"
          variant="outlined"
          density="compact"
          class="mb-4"
          prepend-icon=""
          hide-details
          :prepend-inner-icon="mdiPaperclip"
          :accept="accepted.join(', ')"
          @update:model-value="onFileChange"
        />

        <template v-if="digitalDocumentField">
          <p class="text-body-2 mb-2">
            {{ t('attachmentsMsg') }}
          </p>
          <v-file-input
            v-model="attachmentsInputValue"
            :label="t('selectAttachments')"
            variant="outlined"
            density="compact"
            hide-details
            accept=".zip"
            class="mb-4"
            prepend-icon=""
            :prepend-inner-icon="mdiZipBox"
            clearable
          />
        </template>

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

        <v-progress-linear
          v-if="upload.loading.value"
          v-model="uploadPercent"
          class="mb-2"
          rounded
          height="28"
          color="primary"
        >
          <template v-if="uploadProgress.total && uploadPercent">
            {{ Math.floor(uploadPercent) }}% {{ t('of') }} {{ formatBytes(uploadProgress.total, locale) }}
          </template>
        </v-progress-linear>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :disabled="upload.loading.value"
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!file || upload.loading.value"
          :loading="upload.loading.value"
          @click="upload.execute()"
        >
          {{ t('upload') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  title: Mettre à jour le fichier de données
  selectFile: Sélectionnez ou glissez/déposez un fichier
  selectAttachments: Pièces jointes (archive zip, optionnel)
  attachmentsMsg: Vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces jointes.
  encoding: Encodage du fichier
  encodingAuto: Détection automatique
  cancel: Annuler
  upload: Charger
  close: Fermer
  of: de
  uploadSuccess: Fichier chargé avec succès
  fileTooLarge: Le fichier est trop volumineux pour être importé
en:
  title: Update data file
  selectFile: Select or drag and drop a file
  selectAttachments: Attachments (zip archive, optional)
  attachmentsMsg: You can upload a zip archive containing files to use as attachments.
  encoding: File encoding
  encodingAuto: Auto-detection
  cancel: Cancel
  upload: Upload
  close: Close
  of: of
  uploadSuccess: File uploaded successfully
  fileTooLarge: The file is too large to be imported
</i18n>

<script setup lang="ts">
import { mdiPaperclip, mdiZipBox } from '@mdi/js'
import axios, { type AxiosRequestConfig, type CancelTokenSource } from 'axios'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import useDatasetStore from '~/composables/dataset/dataset-store'
import { accepted } from '~/utils/dataset'

const { t, locale } = useI18n()
const { sendUiNotif } = useUiNotif()
const { id: datasetId, datasetFetch, digitalDocumentField } = useDatasetStore()

const showDialog = ref(false)
const fileInputValue = ref<File[]>([])
const attachmentsInputValue = ref<File[]>([])
const file = ref<File | null>(null)
const attachments = computed(() => attachmentsInputValue.value?.[0] ?? null)
const encoding = ref('')

const encodingOptions = [
  { title: t('encodingAuto'), value: '' },
  { title: 'UTF-8', value: 'UTF-8' },
  { title: 'ISO-8859-1 (Latin-1)', value: 'ISO-8859-1' },
  { title: 'Windows-1252', value: 'Windows-1252' }
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
}

watch(showDialog, (val) => {
  if (val) {
    fileInputValue.value = []
    attachmentsInputValue.value = []
    file.value = null
    encoding.value = ''
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
        uploadProgress.value = { loaded: e.loaded, total: e.total }
      }
    },
    cancelToken: cancelSource.token,
    params: { draft: 'true' } as Record<string, string>
  }

  const formData = new FormData()
  formData.append('dataset', file.value)
  if (attachments.value) {
    formData.append('attachments', attachments.value)
  }
  if (isTextFile.value && encoding.value) {
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
</script>
