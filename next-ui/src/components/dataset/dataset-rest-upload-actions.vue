<template>
  <v-dialog
    v-model="dialog"
    max-width="500px"
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
      <v-card-text>
        <template v-if="result">
          <v-alert
            v-if="result.cancelled"
            type="error"
            :value="true"
            variant="outlined"
          >
            {{ t('cancelled') }}
          </v-alert>
          <template v-else>
            <p
              v-if="result.nbOk"
              class="mb-2"
            >
              {{ t('resultOk', {nb: result.nbOk.toLocaleString()}) }}
            </p>
            <p
              v-if="result.nbCreated"
              class="mb-2"
            >
              {{ t('resultCreated', {nb: result.nbCreated.toLocaleString()}) }}
            </p>
            <p
              v-if="result.nbModified"
              class="mb-2"
            >
              {{ t('resultModified', {nb: result.nbModified.toLocaleString()}) }}
            </p>
            <p
              v-if="result.nbNotModified"
              class="mb-2"
            >
              {{ t('resultNotModified', {nb: result.nbNotModified.toLocaleString()}) }}
            </p>
            <p
              v-if="result.nbDeleted"
              class="mb-2"
            >
              {{ t('resultDeleted', {nb: result.nbDeleted.toLocaleString()}) }}
            </p>
            <v-alert
              v-if="result.dropped"
              type="warning"
              :value="true"
              variant="outlined"
            >
              {{ t('dropped') }}
            </v-alert>
          </template>
          <v-alert
            v-if="result.nbErrors"
            type="error"
            :value="true"
            variant="outlined"
          >
            {{ t('resultErrors', {nb: result.nbErrors.toLocaleString()}) }}
            <ul>
              <li
                v-for="(error, i) in result.errors"
                :key="i"
              >
                <span v-if="error.line !== -1">{{ t('line') }} {{ error.line }} : </span>{{ error.error }}
              </li>
            </ul>
          </v-alert>
          <v-alert
            v-if="result.warnings?.length"
            type="warning"
            :value="true"
            variant="outlined"
          >
            <ul>
              <li
                v-for="(warning, i) in result.warnings"
                :key="i"
              >
                {{ warning }}
              </li>
            </ul>
          </v-alert>
        </template>
        <v-form
          v-else
          v-model="form"
        >
          <div
            class="mt-3 mb-3"
          >
            <v-alert
              color="warning"
              class="mb-6"
              :variant="drop ? undefined : 'outlined'"
            >
              <v-checkbox
                v-model="drop"
                class="mt-0"
                :label="t('drop')"
                hide-details
                base-color="warning"
              />
            </v-alert>

            <v-file-input
              v-model="file"
              :label="t('selectFile')"
              variant="outlined"
              density="compact"
              hide-details
              accept=".csv,.geojson,.xlsx,.ods,.xls"
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
                  template
                  style="margin-top:-2px;"
                />
              </template>
            </v-file-input>
            <template v-if="dataset?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
              <!--<p v-t="'attachmentsMsg'" />-->
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
            <v-progress-linear
              v-if="upload.loading.value"
              v-model="uploadProgress"
              class="my-1"
              style="max-width: 500px;"
              color="primary"
            />
          </div>
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
            variant="text"
            :disabled="upload.loading.value"
            @click="dialog = false"
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
  selectFile: sélectionnez glissez/déposez un fichier
  cancel: Annuler
  load: Charger
  ok: Ok
  resultOk: "{nb} ligne(s) OK"
  resultModified: "{nb} ligne(s) modifiée(s)"
  resultNotModified: "{nb} ligne(s) sans modification"
  resultErrors: "{nb} erreur(s)"
  resultCreated: "{nb} ligne(s) créée(s)"
  resultDeleted: "{nb} ligne(s) supprimées(s)"
  separator: séparateur
  drop: Cochez pour supprimer toutes les lignes existantes avant d'importer les nouvelles
  dropped: "Toutes les lignes existantes ont été supprimées"
  cancelled: "Suppression des lignes existantes et autres opérations annulées à cause des erreurs"
  selectAttachmentsFile: sélectionnez un fichier zip de pièces jointes
  attachmentsMsg: Optionnellement vous pouvez charger une archive zip contenant des fichiers à utiliser comme pièces à joindre aux lignes du fichier principal. Dans ce cas le fichier principal doit avoir une colonne qui contient les chemins des pièces jointes dans l'archive.
en:
  loadLines: Load multiple lines from a file
  selectFile: select or drag and drop a file
  cancel: Cancel
  load: Load
  ok: Ok
  resultOk: "{nb} OK line(s)"
  resultModified: "{nb} modified line(s)"
  resultNotModified: "{nb} line(s) without modifications"
  resultErrors: "{nb} error(s)"
  resultCreated: "{nb} created line(s)"
  resultDeleted: "{nb} deleted line(s)"
  separator: separator
  drop: Check to delete all existing lines before importing new ones
  dropped: "All existing lines have been deleted"
  cancelled: "Deletion of existing lines and other operations cancelled because of errors"
  selectAttachmentsFile: select an attachments zip file
  attachmentsMsg: Optionally you can load a zip archive containing files to be used as attachments to the lines of the main dataset file. In this case the main data file must have a column that contains paths of the attachments in the archive.
</i18n>

<script lang="ts" setup>
import { type RestActionsSummary } from '#api/types'
import axios, { AxiosRequestConfig } from 'axios'

const { t } = useI18n()

const { dataset, id: datasetId } = useDatasetStore()

const form = ref(false)
const dialog = ref(false)
const file = ref<File>()
const attachmentsFile = ref<File>()
const result = ref<RestActionsSummary>()
const uploadProgress = ref<number>()
const csvSep = ref(',')
const drop = ref(false)

// using file.type is buggy in some browsers
const isCSV = computed(() => file.value?.name && file.value.name.toLowerCase().endsWith('.csv'))

watch(dialog, () => {
  result.value = undefined
  file.value = undefined
  attachmentsFile.value = undefined
  uploadProgress.value = 0
  csvSep.value = ','
  drop.value = false
})

const upload = useAsyncAction(async () => {
  if (!file.value) return
  const options: AxiosRequestConfig = {
    onUploadProgress: (e) => {
      if (e.lengthComputable) {
        uploadProgress.value = e.total && ((e.loaded / e.total) * 100)
      }
    },
    params: { draft: true }
  }
  if (isCSV.value) {
    options.params.sep = csvSep.value
  }
  if (drop.value) {
    options.params.drop = true
  }
  const formData = new FormData()
  formData.append('actions', file.value)
  if (attachmentsFile.value) {
    formData.append('attachments', attachmentsFile.value)
  }
  try {
    result.value = await axios.post(`${$apiPath}/datasets/${datasetId}/_bulk_lines`, formData, options).then(r => r.data)
  } catch (error: any) {
    if (typeof (error.response && error.response.data) === 'object') {
      result.value = error.response.data
    } else {
      throw error
    }
  }
})
</script>

<style lang="css" scoped>
</style>
