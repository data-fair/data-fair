<template>
  <v-layout column>
    <form @submit.prevent="save()">
      <v-layout row>
        <h3 class="headline">Schéma</h3>
        <v-spacer/>
        <div>
          <v-btn type="submit" color="primary" v-if="updated">Appliquer</v-btn>
          <v-btn v-if="updated" flat @click="resetSchema">Annuler les modifications</v-btn>
        </div>
      </v-layout>

      <v-container fluid grid-list-md v-for="extension in extensions" :key="extension.key">
        <br v-if="extension.key">
        <v-subheader v-if="extension.key && remoteServicesMap[extension.remoteService]">Extension: {{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServicesMap[extension.remoteService].title }})</v-subheader>
        <v-layout row v-for="field in schema.filter(field => field['x-extension'] === extension.key)" :key="field.key">
          <v-flex xs4>
            <v-text-field label="Libellé" v-model="field.title" :placeholder="field['x-originalName']"/>
          </v-flex>
          <v-flex xs5>
            <v-text-field label="Description" multi-line rows="1" v-model="field.description" :id="'description-' + field.key"/>
          </v-flex>
          <v-flex xs3>
            <v-select
              v-if="!field['x-extension']"
              :items="fieldsVocabulary[field.key]"
              item-text="title"
              item-value="id"
              v-model="field['x-refersTo']"
              label="Concept"
            />
            <v-text-field v-else-if="field['x-refersTo'] && vocabulary[field['x-refersTo']]" label="Concept" disabled v-model="vocabulary[field['x-refersTo']].title"/>
          </v-flex>
        </v-layout>
      </v-container>
    </form>
  </v-layout>
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
    },
    fieldsVocabulary() {
      return this.schema.reduce((a, field) => {
        if (field['x-extension']) return a
        a[field.key] = this.vocabularyArray
          .map(term => ({title: term.title, id: term.identifiers[0]}))
          .filter(term => !this.schema.find(f => (f['x-refersTo'] === term.id) && (f.key !== field.key)))
        return a
      }, {})
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
