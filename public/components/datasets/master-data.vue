<template>
  <v-container fluid>
    <v-form ref="form" style="max-width: 800px;">
      <v-jsf
        v-if="editMasterData"
        v-model="editMasterData"
        :schema="schema"
      />
      <v-btn @click="validate">
        Enregistrer
      </v-btn>
    </v-form>
  </v-container>
</template>

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
        const schema = JSON.parse(JSON.stringify(datasetSchema.properties.masterData))
        schema.items.properties.input.items.enum = this.dataset.schema.filter(p => p['x-refersTo']).map(p => p.key)
        return schema
      },
    },
    watch: {
      'dataset.masterData': {
        handler() {
          this.editMasterData = JSON.parse(JSON.stringify(this.dataset.masterData || []))
        },
        immediate: true,
      },
    },
    methods: {
      ...mapActions('dataset', ['patch']),
      validate() {
        const valid = this.$refs.form.validate()
        if (valid) this.patch({ masterData: this.editMasterData })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
