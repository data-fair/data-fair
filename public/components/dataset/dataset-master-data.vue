<template>
  <v-container fluid>
    <v-form ref="form" style="max-width: 800px;">
      <v-jsf
        v-if="editMasterData"
        v-model="editMasterData"
        :schema="schema"
        :options="{context, locale: 'fr'}"
      />
      <v-btn
        v-t="'save'"
        color="primary"
        class="mt-4"
        @click="validate"
      />
    </v-form>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  save: Enregistrer
en:
  save Save
</i18n>

<script>
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'
  import '@koumoul/vjsf/lib/deps/third-party.js'
  import { mapState, mapActions } from 'vuex'
  const datasetSchema = require('~/../contract/dataset.js')
  export default {
    components: { VJsf },
    data() {
      return {
        editMasterData: null,
      }
    },
    computed: {
      ...mapState('dataset', ['dataset']),
      schema() {
        return JSON.parse(JSON.stringify(datasetSchema.properties.masterData))
      },
      context() {
        return {
          dataset: this.dataset,
          stringProperties: this.dataset.schema
            .filter(p => p.type === 'string')
            .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })),
          searchProperties: this.dataset.schema
            .filter(p => p.type === 'string' && (!p['x-capabilities'] || !p['x-capabilities'].textStandard))
            .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key })),
          propertiesWithConcepts: this.dataset.schema
            .filter(p => p['x-refersTo'])
            .map(p => ({ key: p.key, title: p.title || p['x-originalName'] || p.key, 'x-refersTo': p['x-refersTo'] })),
          hasDateIntervalConcepts: !!(this.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/startDate') && this.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/endDate')),
        }
      },
    },
    watch: {
      'dataset.masterData': {
        handler() {
          this.editMasterData = JSON.parse(JSON.stringify(this.dataset.masterData || {}))
        },
        immediate: true,
      },
    },
    methods: {
      ...mapActions('dataset', ['patchAndCommit']),
      validate() {
        const valid = this.$refs.form.validate()
        if (valid) this.patchAndCommit({ masterData: this.editMasterData })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
