<template lang="html">
  <v-container data-iframe-height>
    <v-alert
      v-if="dataset && !dataset.isRest"
      type="error"
    >
      Ces données ne sont pas éditables
    </v-alert>
    <v-alert
      v-else-if="dataset && !dataset.userPermissions.includes('createLine')"
      type="error"
    >
      Vous n'avez pas la permission de saisir ces données
    </v-alert>
    <template v-else-if="dataset || jsonSchema">
      <v-form
        ref="editLineForm"
        v-model="valid"
      >
        <dataset-edit-line-form
          v-model="line"
          :own-lines="ownLinesMode"
          @onFileUpload="onFileUpload"
        />
        <v-row>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="saving"
            :disabled="sent || !valid"
            @click="saveLine"
          >
            Enregistrer
          </v-btn>
          <v-spacer />
        </v-row>
      </v-form>
    </template>
  </v-container>
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import { mapState, mapGetters } from 'vuex'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  data: () => ({
    valid: false,
    saving: false,
    sent: false,
    line: {},
    file: null
  }),
  computed: {
    ...mapGetters('session', ['activeAccount']),
    ...mapState('dataset', ['dataset', 'jsonSchema']),
    ...mapGetters('dataset', ['resourceUrl']),
    ownLinesMode () {
      return (this.dataset && this.dataset.rest && this.dataset.rest.lineOwnership) || (!this.dataset && !!this.jsonSchema)
    }
  },
  methods: {
    onFileUpload (file) {
      this.file = file
    },
    async saveLine () {
      if (!this.$refs.editLineForm.validate()) return
      this.saving = true
      await new Promise(resolve => setTimeout(resolve, 100))
      if (this.ownLinesMode) {
        await this.$axios.$post(`${this.resourceUrl}/own/${this.activeAccount.type}:${this.activeAccount.id}/lines`, this.line)
      } else {
        await this.$store.dispatch('dataset/saveLine', { line: this.line, file: this.file })
      }
      this.saving = false
      this.sent = true
    }
  }
}
</script>
