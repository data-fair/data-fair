<template>
  <v-dialog v-model="dialog" max-width="500px">
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
        <v-form v-model="form">
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
          v-t="'cancel'"
          text
          @click="dialog = false"
        />
        <v-btn
          v-t="'load'"
          :disabled="!form || importing"
          :loading="importing"
          color="primary"
          @click="upload"
        />
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
en:
  loadLines: Load multiple lines from a file
  selectFile: Select a file
  cancel: Cancel
  load: Load
</i18n>

<script>
  export default {
    props: ['dataset'],
    data: () => ({
      form: false,
      dialog: false,
      file: null,
      importing: false,
    }),
    methods: {
      async upload() {
        const formData = new FormData()
        formData.append('actions', this.file)
        this.importing = true
        await this.$axios.$post(`api/v1/datasets/${this.dataset.id}/_bulk_lines`, formData)
        this.importing = false
        this.dialog = false
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
