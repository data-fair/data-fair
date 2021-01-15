<template lang="html">
  <v-form
    ref="editLineForm"
    :lazy-validation="true"
  >
    <v-jsf
      :value="value"
      :schema="jsonSchema"
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
          @change="file => $emit(onFileUpload, file)"
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
    props: ['value'],
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
    },
  }
</script>

<style lang="css" scoped>
</style>
