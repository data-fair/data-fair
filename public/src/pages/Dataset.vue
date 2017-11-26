<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="dataset">
    <md-layout md-row>
      <md-layout md-column md-flex="40">
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="dataset.title" @blur="save"></md-input>
        </md-input-container>
      </md-layout>
      <md-layout md-column md-flex="55" md-flex-offset="5">
        <md-input-container>
          <label>Titre</label>
          <md-textarea v-model="dataset.description" @blur="save"></md-textarea>
        </md-input-container>
      </md-layout>
    </md-layout>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'dataset',
  data: () => ({
    dataset: null
  }),
  computed: mapState({
    user: state => state.user
  }),
  mounted() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId).then(result => {
      this.dataset = result.data
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.$route.params.datasetId, this.dataset).then(result => {
        this.dataset = result.data
      })
    }
  }
}
</script>
