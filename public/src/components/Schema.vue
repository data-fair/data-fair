<template>
  <md-layout md-column>
    <form @submit.prevent="patch({schema})">
      <md-layout md-row>
        <h3 class="md-headline" style="flex:1">Schéma</h3>
        <div style="margin-top: 24px;">
          <md-button type="submit" class="md-raised md-warn" v-if="updated">Appliquer</md-button>
          <md-button v-if="updated" @click="resetSchema">Annuler les modifications</md-button>
        </div>
      </md-layout>

      <md-list>
        <md-list-item v-for="field in schema" :key="field.key">
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
                <md-select v-model="field['x-refersTo']">
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
import { mapState, mapActions } from 'vuex'

export default {
  name: 'Schema',
  data: () => ({
    schema: []
  }),
  computed: {
    ...mapState(['vocabularyArray']),
    ...mapState('dataset', ['dataset']),
    originalSchema() {
      return JSON.stringify(this.dataset && this.dataset.schema)
    },
    updated() {
      return JSON.stringify(this.schema) !== this.originalSchema
    },
    extensions() {
      return [{}].concat(this.dataset.extensions)
    }
  },
  mounted() {
    if (this.dataset) {
      this.schema = this.dataset.schema.map(field => Object.assign({}, field))
    }
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    resetSchema() {
      this.schema = JSON.parse(this.originalSchema)
    }
  }
}
</script>
