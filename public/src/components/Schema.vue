<template>
  <md-layout md-column>
    <form @submit.prevent="save()">
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
            <md-layout md-flex="25">
              <div style="width:100%;">
                <md-input-container>
                  <label>Libellé</label>
                  <md-input v-model="field.title" :placeholder="field['x-originalName']"/>
                </md-input-container>
              </div>
            </md-layout>

            <md-layout md-flex="45" md-flex-offset="5">
              <md-input-container v-if="editField === field.key">
                <label>Description</label>
                <md-textarea v-model="field.description" :id="'description-' + field.key"/>
              </md-input-container>
              <!-- do not use textarea because of performance problems -->
              <div v-else style="width:100%;min-height:32px;" class="md-input-container md-has-value fake-input-container" @click="setEditField(field.key)">
                <p style="padding:5px 0;">{{ field.description }}</p>
              </div>
            </md-layout>

            <md-layout md-flex="20" md-flex-offset="5">
              <md-input-container v-if="!field['x-extension']">
                <label>Concept</label>
                <md-select v-model="field['x-refersTo']">
                  <md-option :value="null">Pas de concept</md-option>
                  <md-option :value="term.identifiers[0]" v-for="(term, i) in vocabularyArray.filter(term => !schema.find(f => (f['x-refersTo'] === term.identifiers[0]) && (f.id !== field.id)))" :key="i">{{ term.title }}</md-option>
                </md-select>
              </md-input-container>
              <md-input-container v-else-if="field['x-refersTo'] && vocabulary[field['x-refersTo']]">
                <label>Concept</label>
                <md-input :disabled="true" v-model="vocabulary[field['x-refersTo']].title"/>
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
    schema: [],
    editField: null,
    originalSchema: null
  }),
  computed: {
    ...mapState(['vocabularyArray', 'vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['remoteServicesMap']),
    updated() {
      return JSON.stringify(this.schema) !== this.originalSchema
    },
    extensions() {
      return [{key: undefined}].concat((this.dataset.extensions || [])
        .filter(ext => ext.active)
        .map(ext => ({key: ext.remoteService + '/' + ext.action, ...ext})))
    }
  },
  watch: {
    'dataset.schema'() {
      this.initSchema()
    }
  },
  mounted() {
    if (this.dataset) {
      this.initSchema()
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit', 'fetchRemoteService']),
    initSchema() {
      const originalSchema = JSON.stringify(this.dataset && this.dataset.schema)
      if (this.originalSchema === originalSchema) return
      this.originalSchema = originalSchema
      this.schema = this.dataset.schema.map(field => Object.assign({}, field))
      this.dataset.extensions = this.dataset.extensions || []
      this.dataset.extensions.filter(ext => ext.active).forEach(extension => this.fetchRemoteService(extension.remoteService))
    },
    resetSchema() {
      this.schema = JSON.parse(this.originalSchema)
    },
    setEditField(key) {
      this.editField = key
      // cf https://learn.jquery.com/using-jquery-core/faq/how-do-i-select-an-element-by-an-id-that-has-characters-used-in-css-notation/
      this.$nextTick(() => document.querySelector('#description-' + key.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1')).focus())
    },
    save() {
      this.patchAndCommit({schema: this.schema.map(field => Object.assign({}, field))})
    }
  }
}
</script>

<style lang="less">
.fake-input-container{
  ::after {
    position: absolute;
    left: 0;
    height: 1px;
    right: 0;
    bottom: 0;
    background-color: rgba(0,0,0,.12);
    content: " ";
  }
  p {
    margin: 0;
  }
}
</style>
