<template lang="html">
  <v-container>
    <v-alert v-if="!dataset.isRest" type="error">
      Ces données ne sont pas éditables
    </v-alert>
    <v-alert v-else-if="!dataset.userPermissions.includes('createLine')" type="error">
      Vous n'avez pas la permission de saisir ces données
    </v-alert>
    <template v-else>
      <dataset-edit-line-form
        v-model="line"
        @onFileUpload="onFileUpload"
      />
      <v-row>
        <v-spacer />
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="sent"
          @click="saveLine"
        >
          Enregistrer
        </v-btn>
        <v-spacer />
      </v-row>
    </template>
  </v-container>
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import { mapState } from 'vuex'

  export default {
    data: () => ({
      saving: false,
      sent: false,
      line: {},
      file: null,
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
    },
    methods: {
      onFileUpload(file) {
        this.file = file
      },
      async saveLine() {
        this.saving = true
        await this.$store.dispatch('dataset/saveLine', { line: this.line, file: this.file })
        this.saving = false
        this.sent = true
      },
    },
  }
</script>
