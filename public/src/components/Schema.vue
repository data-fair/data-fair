<template>
  <md-layout md-column>
    <form @submit.prevent="patchAndCommit({schema})">
      <md-layout md-row>
        <h3 class="md-headline" style="flex:1">Schéma</h3>
        <div style="margin-top: 24px;">
          <md-button type="submit" class="md-raised md-warn" v-if="updated">Appliquer</md-button>
          <md-button v-if="updated" @click="resetSchema">Annuler les modifications</md-button>
        </div>
      </md-layout>

      <md-list v-for="extension in extensions" :key="extension.key">
        <br v-if="extension.key">
        <md-subheader v-if="extension.key && remoteServicesMap[extension.remoteService]">Extension: {{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServicesMap[extension.remoteService].title }})</md-subheader>
        <md-list-item v-for="field in schema.filter(field => field['x-extension'] === extension.key)" :key="field.key">
          <md-layout md-row>
            <md-layout md-flex="20">
              <md-input-container>
                <label>Libellé</label>
                <md-input v-model="field.title" :placeholder="field['x-originalName']"/>
              </md-input-container>
            </md-layout>

            <md-layout md-flex="45" md-flex-offset="5">
              <md-input-container>
                <label>Description</label>
                <md-textarea v-model="field.description"/>
              </md-input-container>
            </md-layout>

            <md-layout md-flex="25" md-flex-offset="5">
              <md-input-container>
                <label>Concept</label>
                <md-select v-model="field['x-refersTo']" :disabled="!!field['x-extension']">
                  <md-option :value="null">Pas de concept</md-option>
                  <md-option :value="term.identifiers[0]" v-for="(term, i) in vocabularyArray.filter(term => !schema.find(f => (f['x-refersTo'] === term.identifiers[0]) && (f.id !== field.id)))" :key="i">{{ term.title }}</md-option>
                </md-select>
              </md-input-container>
            </md-layout>
          </md-layout>
        </md-list-item>
      </md-list>
    </form>
  </md-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  name: 'Schema',
  data: () => ({
    schema: []
  }),
  computed: {
    ...mapState(['vocabularyArray']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['remoteServicesMap']),
    originalSchema() {
      return JSON.stringify(this.dataset && this.dataset.schema)
    },
    updated() {
      return JSON.stringify(this.schema) !== this.originalSchema
    },
    extensions() {
      return [{key: undefined}].concat((this.dataset.extensions || [])
        .filter(ext => ext.active)
        .map(ext => ({key: ext.remoteService + '/' + ext.action, ...ext})))
    }
  },
  mounted() {
    if (this.dataset) {
      this.schema = this.dataset.schema.map(field => Object.assign({}, field))
      this.dataset.extensions = this.dataset.extensions || []
      this.dataset.extensions.filter(ext => ext.active).forEach(extension => this.fetchRemoteService(extension.remoteService))
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit', 'fetchRemoteService']),
    resetSchema() {
      this.schema = JSON.parse(this.originalSchema)
    }
  }
}
</script>
