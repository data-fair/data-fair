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
        v-if="line"
        ref="editLineForm"
        v-model="valid"
      >
        <dataset-edit-line-form
          v-model="line"
          :own-lines="ownLinesMode"
          :readonly-cols="Object.keys(queryContext.data)"
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
    existingLine: null,
    line: null,
    file: null
  }),
  computed: {
    ...mapGetters('session', ['activeAccount']),
    ...mapState('dataset', ['dataset', 'jsonSchema']),
    ...mapGetters('dataset', ['resourceUrl']),
    ownLinesMode () {
      return (this.dataset && this.dataset.rest && this.dataset.rest.lineOwnership) || (!this.dataset && !!this.jsonSchema)
    },
    queryContext () {
      const filters = {}
      const data = {}
      for (const [key, value] of Object.entries(this.$route.query)) {
        if (key.endsWith('_eq')) {
          if (key.startsWith('_c_')) {
            const conceptId = key.slice(3, -3)
            const property = this.dataset.schema.find(p => p['x-concept']?.id === conceptId)
            if (!property) {
              console.error(`property matching concept ${conceptId} not found`)
            } else {
              filters[key] = value
              data[property.key] = value
            }
          } else if (key.startsWith('_d_')) {
            const datasetPrefix = `_d_${this.dataset.id}_`
            if (key.startsWith(datasetPrefix)) {
              const propertyKey = key.replace(datasetPrefix, '').slice(0, -3)
              filters[propertyKey + '_eq'] = value
              data[propertyKey] = value
            }
          } else {
            const propertyKey = key.slice(-3)
            filters[key] = value
            data[propertyKey] = value
          }
        }
      }
      return { filters, data }
    }
  },
  async created () {
    if (Object.keys(this.queryContext.data).length) {
      const existingLines = await this.$axios.$get(`${this.resourceUrl}/lines`, { params: this.queryContext.filters })
      this.existingLine = existingLines.results[0]
      this.line = this.existingLine ? { ...this.existingLine } : { ...this.queryContext.data }
    } else {
      this.line = {}
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
        const line = { ...this.line }
        if (this.existingLine) line._id = this.existingLine._id
        await this.$axios.$post(`${this.resourceUrl}/own/${this.activeAccount.type}:${this.activeAccount.id}/lines`, line)
      } else {
        if (this.existingLine) {
          await this.$store.dispatch('dataset/saveLine', { line: this.line, file: this.file, id: this.existingLine._id })
        } else {
          await this.$store.dispatch('dataset/saveLine', { line: this.line, file: this.file })
        }
      }
      this.saving = false
      this.sent = true
    }
  }
}
</script>
