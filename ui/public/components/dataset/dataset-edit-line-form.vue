<template lang="html">
  <div
    v-if="editSchema"
    ref="editLineForm"
    :lazy-validation="true"
  >
    <lazy-v-jsf
      :value="value"
      :schema="editSchema"
      :options="vjsfOptions"
      @input="val => $emit('input', val)"
    />

    <template v-if="dataset && dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
      <p v-t="'loadAttachment'" />
      <div class="mt-3 mb-3">
        <v-file-input
          v-model="file"
          :label="$t('selectFile')"
          outlined
          dense
          clearable
          @click:clear="delete value[digitalDocumentField.key]"
          @change="file => $emit('onFileUpload', file)"
        />
      </div>
      <v-progress-linear
        v-if="lineUploadProgress"
        v-model="lineUploadProgress"
      />
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  loadAttachment: Chargez un fichier en pièce jointe.
  selectFile: sélectionnez un fichier
en:
  loadAttachment: Load a file as an attachment
  selectFile: select a file
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: ['value', 'selectedCols', 'ownLines', 'readonlyCols'],
  data: () => ({
    vjsfOptions: {
      locale: 'fr',
      removeAdditionalProperties: true,
      hideReadOnly: true,
      textareaProps: {
        outlined: true
      },
      arrayItemCardProps: {
        outlined: true,
        tile: true
      },
      dialogCardProps: {
        outlined: true
      }
    },
    file: null
  }),
  computed: {
    ...mapState('dataset', ['dataset', 'lineUploadProgress', 'jsonSchema']),
    ...mapGetters('dataset', ['digitalDocumentField']),
    editSchema () {
      if (!this.jsonSchema) return
      const schema = JSON.parse(JSON.stringify(this.jsonSchema))
      if (this.ownLines) {
        delete schema.properties._owner
        delete schema.properties._ownerName
      }
      Object.keys(schema.properties).forEach(key => {
        if (this.readonlyCols && this.readonlyCols.includes(key)) {
          schema.properties[key].readOnly = true
          schema.properties[key]['x-options'] = schema.properties[key]['x-options'] || {}
          schema.properties[key]['x-options'].hideReadOnly = false
        }
        if (this.selectedCols && this.selectedCols.length && !this.selectedCols.includes(key)) {
          schema.properties[key].readOnly = true
          schema.properties[key]['x-options'] = schema.properties[key]['x-options'] || {}
          schema.properties[key]['x-options'].hideReadOnly = true
        }
        if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument') {
          schema.properties[key].readOnly = true
          schema.properties[key]['x-options'] = schema.properties[key]['x-options'] || {}
          schema.properties[key]['x-options'].hideReadOnly = true
        }
      })
      return schema
    }
  },
  created () {
    if (!this.jsonSchema) this.$store.dispatch('dataset/fetchJsonSchema')
    if (this.digitalDocumentField && this.value[this.digitalDocumentField.key]) {
      this.file = { name: this.value[this.digitalDocumentField.key].replace(this.value._id + '/', '') }
    } else {
      this.file = null
    }
  }
}
</script>

<style lang="css" scoped>
</style>
