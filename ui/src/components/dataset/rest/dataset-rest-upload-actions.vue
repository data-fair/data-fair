<template>
  <v-dialog
    v-model="dialog"
    max-width="500"
    persistent
  >
    <template #activator="{props}">
      <slot
        name="activator"
        :props="props"
        :title="t('loadLines')"
      />
    </template>

    <v-card
      border
      :title="t('loadLines')"
    >
      <v-card-text :class="{ 'pb-2': !result }">
        <dataset-rest-actions-summary
          v-if="result"
          :summary="result"
        />
        <v-form
          v-else
          v-model="form"
        >
          <!-- drop swaps the whole collection and is forbidden on the own/{owner} routes (a
               manageOwnLines holder must not wipe the dataset), so hide it in own-lines mode -->
          <v-alert
            v-if="!ownLines"
            color="warning"
            class="mb-6"
            variant="outlined"
          >
            <v-checkbox
              v-model="drop"
              :label="t('drop')"
              hide-details
              color="warning"
              base-color="warning"
            />
          </v-alert>

          <v-file-input
            v-model="file"
            :label="t('selectFile')"
            variant="outlined"
            density="compact"
            hide-details
            accept=".csv,.tsv,.geojson,.json,.ndjson,.xlsx,.ods,.fods,.xls,.dbf,.zip,.csv.gz,.tsv.gz,.geojson.gz,.json.gz,.ndjson.gz"
            :rules="[(file) => !!file || '']"
          >
            <template
              v-if="isCSV"
              #append
            >
              <v-select
                v-model="csvSep"
                :items="[',', ';']"
                density="compact"
                variant="outlined"
                hide-details
                :label="t('separator')"
                min-width="120"
              />
            </template>
          </v-file-input>
          <template v-if="dataset?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
            <!--<p> {{ t('attachmentsMsg') }} </p>-->
            <v-file-input
              v-model="attachmentsFile"
              :label="t('selectAttachmentsFile')"
              variant="outlined"
              density="compact"
              class="my-4"
              clearable
              accept=".zip"
            />
          </template>
          <template v-if="upload.loading.value">
            <div class="text-body-small mt-4">
              {{ processingProgress === undefined ? t('uploading') : (processingProgress < 1000 ? t('processing') : t('finalizing')) }}
            </div>
            <file-upload-progress
              v-if="processingProgress === undefined"
              :percent="uploadProgress?.percent"
              :total="uploadProgress?.total"
              class="my-2"
            />
            <file-upload-progress
              v-else
              :percent="processingProgress < 1000 ? processingProgress / 10 : undefined"
              class="my-2"
            />
          </template>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          v-if="result"
          :disabled="!form || upload.loading.value"
          :loading="upload.loading.value"
          color="primary"
          variant="flat"
          @click="dialog=false"
        >
          {{ t('ok') }}
        </v-btn>
        <template v-else>
          <v-btn
            @click="upload.loading.value ? cancelSource?.cancel(t('cancelled')) : (dialog = false)"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            :disabled="!form || upload.loading.value"
            :loading="upload.loading.value"
            :color="drop ? 'warning' : 'primary'"
            variant="flat"
            @click="upload.execute()"
          >
            {{ t('load') }}
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  loadLines: Charger plusieurs lignes depuis un fichier
  selectFile: Sélectionnez ou glissez/déposez un fichier
  cancel: Annuler
  cancelled: Chargement annulé
  load: Charger
  ok: Ok
  separator: Séparateur
  drop: Cochez pour supprimer toutes les lignes existantes avant d'importer les nouvelles
  uploading: Envoi du fichier
  processing: Traitement des lignes
  finalizing: Finalisation
  selectAttachmentsFile: Sélectionnez un fichier zip de pièces jointes
  attachmentsMsg: Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal. Dans ce cas le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
en:
  loadLines: Load multiple lines from a file
  selectFile: Select or drag and drop a file
  cancel: Cancel
  cancelled: Loading cancelled
  load: Load
  ok: Ok
  separator: Separator
  drop: Check to delete all existing lines before importing new ones
  uploading: Sending the file
  processing: Processing the lines
  finalizing: Finalizing
  selectAttachmentsFile: Select an attachments zip file
  attachmentsMsg: Optionally you can load a zip archive containing files to be used as attachments to the lines of the main dataset file. In this case the main data file must have a column that contains paths of the attachments in the archive.
</i18n>

<script setup lang="ts">
import { type RestActionsSummary } from '#api/types'
import axios, { AxiosRequestConfig, type CancelTokenSource } from 'axios'
import { useUploadLeaveGuard } from '~/composables/use-upload-leave-guard'
import useDatasetEdition from '../table/use-dataset-edition'

const { t, locale } = useI18n()

const { dataset } = useDatasetStore()
// own-lines mode: post to own/{owner}/_bulk_lines (bulkOwnLines) so the upload is scoped to the caller
const { ownLines, routeBase } = useDatasetEdition()

const form = ref(false)
const dialog = ref(false)
const file = ref<File>()
const attachmentsFile = ref<File>()
const result = ref<RestActionsSummary>()
const uploadProgress = ref<{ percent?: number, total?: number }>()
// thousandths of the file processed by the server, undefined while the file is being sent
const processingProgress = ref<number>()
const csvSep = ref(',')
const drop = ref(false)

// using file.type is buggy in some browsers
const isCSV = computed(() => !!file.value?.name && /\.csv(\.gz)?$/.test(file.value.name.toLowerCase()))

watch(dialog, () => {
  result.value = undefined
  file.value = undefined
  attachmentsFile.value = undefined
  uploadProgress.value = undefined
  processingProgress.value = undefined
  csvSep.value = ','
  drop.value = false
})

let cancelSource: CancelTokenSource

const upload = useAsyncAction(async () => {
  if (!file.value) return
  cancelSource = axios.CancelToken.source()
  uploadProgress.value = undefined
  processingProgress.value = undefined
  const options: AxiosRequestConfig = {
    onUploadProgress: (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = { percent: e.total && ((e.loaded / e.total) * 100), total: e.total }
      }
      if (e.loaded === e.total) processingProgress.value = processingProgress.value ?? 0
    },
    // the server writes whitespace before its JSON summary while it processes the lines, each "\n"
    // being one thousandth of the file read
    onDownloadProgress: (e) => {
      const text: string | undefined = (e.event?.target as XMLHttpRequest | undefined)?.responseText
      if (text === undefined) return
      const leadingWhitespace = text.match(/^\s*/)?.[0] ?? ''
      processingProgress.value = leadingWhitespace.split('\n').length - 1
    },
    cancelToken: cancelSource.token,
    params: { draft: true }
  }
  if (isCSV.value) {
    options.params.sep = csvSep.value
  }
  if (drop.value) {
    options.params.drop = true
    // a drop swaps the whole collection at its end: hold the dataset lock so that a second one fails
    // with a 409 instead of overwriting this one
    options.params.lock = true
  }
  const formData = new FormData()
  formData.append('actions', file.value)
  if (attachmentsFile.value) {
    formData.append('attachments', attachmentsFile.value)
  }
  try {
    result.value = await axios.post(`${$apiPath}/${routeBase.value}/_bulk_lines`, formData, options).then(r => r.data)
  } catch (error: any) {
    if (axios.isCancel(error)) return
    if (typeof (error.response && error.response.data) === 'object') {
      result.value = error.response.data
    } else {
      throw error
    }
  }
})

// Warn before leaving while a file upload is running, and cancel it on confirm.
useUploadLeaveGuard(() => upload.loading.value, { locale, onConfirmLeave: () => cancelSource?.cancel(t('cancelled')) })
</script>

<style lang="css" scoped>
</style>
