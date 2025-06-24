<template>
  <v-dialog
    v-model="dialog"
    max-width="500px"
    persistent
  >
    <template #activator="{on, attrs}">
      <v-btn
        v-bind="attrs"
        color="primary"
        fab
        x-small
        class="mx-2"
        :title="$t('loadLines')"
        v-on="on"
      >
        <v-icon>mdi-upload</v-icon>
      </v-btn>
    </template>

    <v-card outlined>
      <v-card-title
        v-t="'loadLines'"
        primary-title
      />
      <v-card-text>
        <template v-if="result">
          <v-alert
            v-if="result.cancelled"
            type="error"
            :value="true"
            outlined
          >
            {{ $t('cancelled') }}
          </v-alert>
          <template v-else>
            <p v-if="result.nbOk">
              {{ $t('resultOk', {nb: result.nbOk.toLocaleString()}) }}
            </p>
            <p v-if="result.nbCreated">
              {{ $t('resultCreated', {nb: result.nbCreated.toLocaleString()}) }}
            </p>
            <p v-if="result.nbModified">
              {{ $t('resultModified', {nb: result.nbModified.toLocaleString()}) }}
            </p>
            <p v-if="result.nbNotModified">
              {{ $t('resultNotModified', {nb: result.nbNotModified.toLocaleString()}) }}
            </p>
            <p v-if="result.nbDeleted">
              {{ $t('resultDeleted', {nb: result.nbDeleted.toLocaleString()}) }}
            </p>
            <v-alert
              v-if="result.dropped"
              type="warning"
              :value="true"
              outlined
            >
              {{ $t('dropped') }}
            </v-alert>
          </template>
          <v-alert
            v-if="result.nbErrors"
            type="error"
            :value="true"
            outlined
          >
            {{ $t('resultErrors', {nb: result.nbErrors.toLocaleString()}) }}
            <ul>
              <li
                v-for="(error, i) in result.errors"
                :key="i"
              >
                <span v-if="error.line !== -1">{{ $t('line') }} {{ error.line }} : </span>{{ error.error }}
              </li>
            </ul>
          </v-alert>
          <v-alert
            v-if="result.warnings?.length"
            type="warning"
            :value="true"
            outlined
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
          @submit="upload"
        >
          <div
            class="mt-3 mb-3"
          >
            <v-alert
              color="warning"
              :dark="drop"
              :value="true"
              class="mb-6"
              :outlined="!drop"
            >
              <v-checkbox
                v-model="drop"
                class="mt-0"
                :label="$t('drop')"
                hide-details
                base-color="warning"
              />
            </v-alert>

            <v-file-input
              v-model="file"
              :label="$t('selectFile')"
              outlined
              dense
              hide-details
              accept=".csv,.geojson,.xlsx,.ods,.xls"
              :rules="[(file) => !!file] || ''"
            >
              <template
                v-if="isCSV"
                #append-outer
              >
                <v-select
                  v-model="csvSep"
                  :items="[',', ';']"
                  dense
                  outlined
                  hide-details
                  :label="$t('separator')"
                  template
                  style="margin-top:-2px;"
                />
              </template>
            </v-file-input>
            <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
              <!--<p v-t="'attachmentsMsg'" />-->
              <v-file-input
                v-model="attachmentsFile"
                :label="$t('selectAttachmentsFile')"
                outlined
                dense
                class="my-4"
                clearable
                accept=".zip"
              />
            </template>
            <v-progress-linear
              v-if="importing"
              v-model="uploadProgress"
              class="my-1"
              style="max-width: 500px;"
              :color="$store.getters.readablePrimaryColor"
            />
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          v-if="result"
          v-t="'ok'"
          :disabled="!form || importing"
          :loading="importing"
          color="primary"
          @click="dialog=false"
        />
        <template v-else>
          <v-btn
            v-t="'cancel'"
            text
            :disabled="importing"
            @click="dialog = false"
          />
          <v-btn
            v-t="'load'"
            :disabled="!form || importing"
            :loading="importing"
            :color="drop ? 'warning' : 'primary'"
            @click="upload"
          />
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

<script>
export default {
  props: ['dataset'],
  data: () => ({
    form: false,
    dialog: false,
    file: null,
    attachmentsFile: null,
    importing: false,
    result: null,
    uploadProgress: 0,
    csvSep: ',',
    drop: false
  }),
  computed: {
    isCSV () {
      // using file.type is buggy in some browsers
      return this.file?.name && this.file.name.toLowerCase().endsWith('.csv')
    }
  },
  watch: {
    dialog () {
      this.result = null
      this.file = null
      this.importing = false
      this.uploadProgress = 0
      this.csvSep = ','
      this.drop = false
    }
  },
  methods: {
    async upload (e) {
      if (e) e.preventDefault()
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        },
        params: { draft: true }
      }
      if (this.isCSV) {
        options.params.sep = this.csvSep
      }
      if (this.drop) {
        options.params.drop = true
      }
      const formData = new FormData()
      formData.append('actions', this.file)
      if (this.attachmentsFile) {
        formData.append('attachments', this.attachmentsFile)
      }
      this.importing = true
      try {
        this.result = await this.$axios.$post(`api/v1/datasets/${this.dataset.id}/_bulk_lines`, formData, options)
      } catch (error) {
        if (typeof (error.response && error.response.data) === 'object') {
          this.result = error.response.data
        } else {
          throw error
        }
      }
      this.importing = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
