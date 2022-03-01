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
      <v-card-title v-t="'loadLines'" primary-title />
      <v-card-text>
        <template v-if="result">
          <p v-if="result.nbOk">
            {{ $t('resultOk', {nb: result.nbOk.toLocaleString()}) }}
          </p>
          <p v-if="result.nbCreated">
            {{ $t('resultCreated', {nb: result.nbCreated.toLocaleString()}) }}
          </p>
          <p v-if="result.nbNotModified">
            {{ $t('resultNotModified', {nb: result.nbNotModified.toLocaleString()}) }}
          </p>
          <p v-if="result.nbDeleted">
            {{ $t('resultDeleted', {nb: result.nbDeleted.toLocaleString()}) }}
          </p>
          <v-alert
            v-if="result.nbErrors"
            type="error"
            :value="true"
            outlined
          >
            {{ $t('resultErrors', {nb: result.nbErrors.toLocaleString()}) }}
            <ul>
              <li v-for="(error, i) in result.errors" :key="i">
                <span v-if="error.line !== -1">{{ $t('line') }}{{ error.line }}</span>{{ error.error }}
              </li>
            </ul>
          </v-alert>
        </template>
        <v-form
          v-else
          v-model="form"
          @submit="upload"
        >
          <v-file-input
            v-model="file"
            :label="$t('selectFile')"
            outlined
            dense
            hide-details
            accept=".csv,.geojson"
            :rules="[(file) => !!file] || ''"
          />
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
            color="primary"
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
  selectFile: sélectionnez un fichier
  cancel: Annuler
  load: Charger
  ok: Ok
  resultOk: "{nb} ligne(s) OK"
  resultNotModified: "{nb} ligne(s) sans modification"
  resultErrors: "{nb} erreur(s)"
  resultCreated: "{nb} ligne(s) créée(s)"
  resultDeleted: "{nb} ligne(s) supprimées(s)"
en:
  loadLines: Load multiple lines from a file
  selectFile: Select a file
  cancel: Cancel
  load: Load
  ok: Ok
  resultOk: "{nb} OK line(s)"
  resultNotModified: "{nb} line(s) without modifications"
  resultErrors: "{nb} error(s)"
  resultCreated: "{nb} created line(s)"
  resultDeleted: "{nb} deleted line(s)"
</i18n>

<script>
  export default {
    props: ['dataset'],
    data: () => ({
      form: false,
      dialog: false,
      file: null,
      importing: false,
      result: null,
    }),
    watch: {
      dialog() {
        this.result = null
        this.file = null
        this.importing = false
      },
    },
    methods: {
      async upload(e) {
        if (e) e.preventDefault()
        const formData = new FormData()
        formData.append('actions', this.file)
        this.importing = true
        try {
          this.result = await this.$axios.$post(`api/v1/datasets/${this.dataset.id}/_bulk_lines`, formData)
        } catch (error) {
          if (typeof (error.response && error.response.data) === 'object') {
            this.result = error.response.data
          } else {
            throw error
          }
        }
        this.importing = false
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
