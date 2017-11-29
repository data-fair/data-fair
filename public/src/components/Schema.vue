<template>
<md-list>
  <md-list-item v-for="field in dataset.schema">
    <md-layout md-row>
      <md-layout md-flex="20">
        <md-input-container>
          <label>Libellé</label>
          <md-input v-model="field.title"></md-input>
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
            <md-option value="term.term" v-for="term in terms">{{term.title}}</md-option>
          </md-select>
        </md-input-container>
      </md-layout>
    </md-layout>
  </md-list-item>
</md-list>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'schema',
  props: ['dataset'],
  data: () => ({
    terms: []
  }),
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/terms').then(results => {
      this.terms = results.data
    })
  }
}
</script>
