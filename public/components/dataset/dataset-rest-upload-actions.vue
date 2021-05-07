<template>
  <v-dialog v-model="dialog" max-width="500px">
    <template #activator="{on, attrs}">
      <v-btn
        v-bind="attrs"
        color="primary"
        fab
        x-small
        class="mx-2"
        title="Charger plusieurs lignes depuis un fichier"
        v-on="on"
      >
        <v-icon>mdi-upload</v-icon>
      </v-btn>
    </template>

    <v-card outlined>
      <v-card-title primary-title>
        Charger plusieurs lignes depuis un fichier
      </v-card-title>
      <v-card-text>
        <v-form v-model="form">
          <v-file-input
            v-model="file"
            label="sélectionnez un fichier"
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
        <v-btn text @click="dialog = false">
          Annuler
        </v-btn>
        <v-btn
          :disabled="!form || importing"
          :loading="importing"
          color="primary"
          @click="upload"
        >
          Charger
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

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
