<template lang="html">
  <v-form
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

    <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
      <p v-t="'loadAttachment'" />
      <div class="mt-3 mb-3">
        <v-file-input
          :label="$t('selectFile')"
          outlined
          dense
          style="max-width: 300px;"
          @change="file => $emit('onFileUpload', file)"
        />
      </div>
      <v-progress-linear v-model="lineUploadProgress" />
    </template>
  </v-form>
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

import { mapState } from 'vuex'
export default {
  props: ['value', 'selectedCols'],
  data: () => ({
    vjsfOptions: {
      locale: 'fr',
      removeAdditionalProperties: true,
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
    }
  }),
  computed: {
    ...mapState('dataset', ['dataset', 'lineUploadProgress', 'jsonSchema']),
    editSchema () {
      if (!this.jsonSchema) return
      const schema = JSON.parse(JSON.stringify(this.jsonSchema))
      Object.keys(schema.properties).forEach(key => {
        if (this.selectedCols && this.selectedCols.length && !this.selectedCols.includes(key)) {
          schema.properties[key].readOnly = true
          schema.properties[key]['x-options'] = schema.properties[key]['x-options'] || {}
          schema.properties[key]['x-options'].hideReadOnly = true
        }
        if (schema.properties[key]['x-refersTo'] === 'http://schema.org/DigitalDocument') {
          delete schema.properties[key]
        }
      })
      return schema
    }
  },
  created () {
    if (!this.jsonSchema) this.$store.dispatch('dataset/fetchJsonSchema')
  }
}
</script>

<style lang="css" scoped>
</style>
