<template lang="html">
  <v-form
    ref="editLineForm"
    :lazy-validation="true"
  >
    <v-jsf
      :value="value"
      :schema="editSchema"
      :options="vjsfOptions"
      @input="val => $emit('input', val)"
    />

    <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
      <p>Chargez un fichier en pièce jointe.</p>
      <div class="mt-3 mb-3">
        <v-file-input
          label="sélectionnez un fichier"
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

<script>

  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import { mapState, mapGetters } from 'vuex'
  export default {
    components: { VJsf },
    props: ['value', 'selectedCols'],
    data: () => ({
      vjsfOptions: {
        locale: 'fr',
        removeAdditionalProperties: true,
        textareaProps: {
          outlined: true,
        },
        arrayItemCardProps: {
          outlined: true,
          tile: true,
        },
        dialogCardProps: {
          outlined: true,
        },
      },
    }),
    computed: {
      ...mapState('dataset', ['dataset', 'lineUploadProgress']),
      ...mapGetters('dataset', ['jsonSchema']),
      editSchema() {
        if (!this.selectedCols || !this.selectedCols.length) return this.jsonSchema
        const schema = JSON.parse(JSON.stringify(this.jsonSchema))
        Object.keys(schema.properties).forEach(key => {
          if (!this.selectedCols.includes(key)) {
            schema.properties[key].readOnly = true
            schema.properties[key]['x-options'] = schema.properties[key]['x-options'] || {}
            schema.properties[key]['x-options'].hideReadOnly = true
          }
        })
        return schema
      },
    },
  }
</script>

<style lang="css" scoped>
</style>