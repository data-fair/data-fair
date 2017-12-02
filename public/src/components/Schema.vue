<template>
<md-layout md-column>
  <md-layout md-row>
    <md-layout md-column md-flex="60">
      <h3 class="md-headline">Schéma</h3>
    </md-layout>
    <md-layout md-column>
      <md-button class="md-raised" v-if="updated" @click="resetSchema" style="position:absolute;">Annuler les modifications</md-button>
      <md-button class="md-raised md-warn" v-if="updated" @click="updateSchema" style="position:absolute;margin-left:260px;">Appliquer</md-button>
    </md-layout>
  </md-layout>
  <md-list>
    <md-list-item v-for="field in schema">
      <md-layout md-row>
        <md-layout md-flex="20">
          <md-input-container>
            <label>Libellé</label>
            <md-input v-model="field.title" :placeholder="field['x-originalName']"></md-input>
          </md-input-container>
        </md-layout>

        <md-layout md-flex="45" md-flex-offset="5">
          <md-input-container>
            <label>Description</label>
            <md-textarea v-model="field.description"></md-textarea>
          </md-input-container>
        </md-layout>

        <md-layout md-flex="25" md-flex-offset="5">
          <md-input-container>
            <label>Concept</label>
            <md-select v-model="field['x-refersTo']">
              <md-option :value="null">Pas de concept</md-option>
              <md-option :value="term.identifiers[0]" v-for="term in vocabulary">{{term.title}}</md-option>
            </md-select>
          </md-input-container>
        </md-layout>
      </md-layout>
    </md-list-item>
  </md-list>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'schema',
  props: ['dataset'],
  data: () => ({
    vocabulary: [],
    schema: {},
    originalSchema: null
  }),
  mounted() {
    if (this.dataset) {
      this.schema = Object.assign({}, this.dataset.schema)
      this.originalSchema = JSON.stringify(this.schema)
    }
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary').then(results => {
      this.vocabulary = results.data
    })
  },
  computed: {
    updated() {
      return JSON.stringify(this.schema) !== this.originalSchema
    }
  },
  methods: {
    resetSchema() {
      this.schema = JSON.parse(this.originalSchema)
    },
    updateSchema() {
      this.$emit('schema-updated', this.schema)
      this.originalSchema = JSON.stringify(this.schema)
    }
  }
}
</script>
