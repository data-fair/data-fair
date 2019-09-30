<template>
  <v-layout column>
    <form @submit.prevent="save()">
      <v-layout row>
        <h3 class="headline">
          Schéma
        </h3>
        <v-spacer />
        <div>
          <v-btn v-if="updated" type="submit" color="primary">
            Appliquer
          </v-btn>
          <v-btn v-if="updated" flat @click="resetSchema">
            Annuler les modifications
          </v-btn>
        </div>
      </v-layout>

      <v-layout row class="py-2">
        <v-btn v-if="dataset.isRest" color="primary" @click="newPropertyKey = null; newPropertyType = null; $refs.addPropertyForm.resetValidation(); addPropertyDialog = true">
          Ajouter une propriété
        </v-btn>
        <v-btn v-if="dataset.isRest" :disabled="!!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')" @click="addAttachmentProperty">
          Accepter des pièces jointes
        </v-btn>
      </v-layout>

      <v-container v-for="extension in extensions" :key="extension.key" fluid pa-0 grid-list-md>
        <br v-if="extension.key">
        <v-subheader v-if="extension.key && remoteServicesMap[extension.remoteService]">
          Extension: {{ remoteServicesMap[extension.remoteService].actions[extension.action].summary }} (service {{ remoteServicesMap[extension.remoteService].title }})
        </v-subheader>
        <v-layout v-for="field in schema.filter(field => !field['x-calculated'] && field['x-extension'] === extension.key)" :key="field.key" row>
          <div>
            <v-btn v-if="dataset.isRest" flat icon color="warning" title="Supprimer cette propriété" @click="schema = schema.filter(f => f.key !== field.key)">
              <v-icon>delete</v-icon>
            </v-btn>
          </div>
          <v-flex xs2>
            <v-text-field v-model="field.key" :disabled="true" label="Clé" />
          </v-flex>
          <v-flex xs2>
            <v-layout v-if="field.type === 'string'" row>
              <v-flex xs8>
                <v-text-field :disabled="true" :value="`${field.type}${field.format ? ' - ' + field.format : ''}`" label="Type" />
              </v-flex>
              <v-flex xs4>
                <v-select
                  v-model="field.separator"
                  :items="[', ', '; ', ' - ', ' / ']"
                  :disabled="field['x-extension'] || field.key.startsWith('_')"
                  label="Split"
                  placeholder=" "
                />
              </v-flex>
            </v-layout>
            <v-text-field v-else :disabled="true" :value="`${field.type}${field.format ? ' - ' + field.format : ''}`" label="Type" />
          </v-flex>
          <v-flex xs3>
            <v-text-field v-model="field.title" :placeholder="field['x-originalName']" label="Libellé" />
          </v-flex>
          <v-flex xs3>
            <v-textarea :id="'description-' + field.key" v-model="field.description" label="Description" rows="1" placeholder=" " />
          </v-flex>
          <v-flex xs2>
            <v-select
              v-if="!field['x-extension']"
              v-model="field['x-refersTo']"
              :items="fieldsVocabulary[field.key]"
              :disabled="field.key.startsWith('_')"
              item-text="title"
              item-value="id"
              label="Concept"
              placeholder=" "
            />
            <v-text-field v-else-if="field['x-refersTo'] && vocabulary[field['x-refersTo']]" v-model="vocabulary[field['x-refersTo']].title" label="Concept" disabled />
          </v-flex>
        </v-layout>
      </v-container>
      <h4>Renseigner le schéma avec un fichier de métadonnées</h4>
      <p>Le fichier de métadonnées doit respecter <a href="https://frictionlessdata.io/specs/table-schema/" target="_blank">ce format</a></p>
      <input ref="schemaInput" type="file" @change="onMetadataUpload">
    </form>

    <v-dialog v-model="addPropertyDialog" max-width="500px">
      <v-card>
        <v-card-title primary-title>
          Ajouter une propriété
        </v-card-title>
        <v-card-text>
          <v-form ref="addPropertyForm" :lazy-validation="true">
            <v-text-field v-model="newPropertyKey" :rules="[v => !!v || '', v => !schema.find(f => f.key === v) || '']" name="key" label="Clé" />
            <v-select
              v-model="newPropertyType"
              :items="propertyTypes"
              :item-text="item => item.title"
              :item-value="item => `${item.type}${item.format}${item.maxLength}`"
              :rules="[v => !!v || '']"
              return-object
              label="Type"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn flat @click="addPropertyDialog = false">
            Annuler
          </v-btn>
          <v-btn color="primary" @click="addProperty">
            Valider
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  name: 'Schema',
  data: () => ({
    schema: [],
    editField: null,
    originalSchema: null,
    addPropertyDialog: false,
    newPropertyKey: null,
    newPropertyType: null,
    propertyTypes: [
      { type: 'string', title: 'Texte' },
      { type: 'string', maxLength: 100000, title: 'Texte long' },
      { type: 'string', format: 'date', title: 'Date' },
      { type: 'string', format: 'date-time', title: 'Date et heure' },
      { type: 'integer', title: 'Nombre entier' },
      { type: 'number', title: 'Nombre' },
      { type: 'boolean', title: 'Booléen' }
    ]
  }),
  computed: {
    ...mapState(['vocabularyArray', 'vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['remoteServicesMap']),
    updated() {
      return JSON.stringify(this.schema) !== this.originalSchema
    },
    extensions() {
      return [{ key: undefined }].concat((this.dataset.extensions || [])
        .filter(ext => ext.active)
        .filter(ext => this.remoteServicesMap[ext.remoteService] && this.remoteServicesMap[ext.remoteService].actions[ext.action])
        .map(ext => ({ key: ext.remoteService + '/' + ext.action, ...ext })))
    },
    fieldsVocabulary() {
      return this.schema.reduce((a, field) => {
        if (field['x-extension']) return a
        a[field.key] = [{ title: 'Aucun concept', id: null }].concat(this.vocabularyArray
          .map(term => ({ title: term.title, id: term.identifiers[0] }))
          .filter(term => !this.schema.find(f => (f['x-refersTo'] === term.id) && (f.key !== field.key))))
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
    ...mapActions('dataset', ['patchAndCommit', 'fetchRemoteServices']),
    initSchema() {
      const originalSchema = JSON.stringify(this.dataset && this.dataset.schema)
      if (this.originalSchema === originalSchema) return
      this.originalSchema = originalSchema
      this.schema = this.dataset.schema.map(field => Object.assign({}, field))
      this.dataset.extensions = this.dataset.extensions || []
      this.fetchRemoteServices()
    },
    resetSchema() {
      this.schema = JSON.parse(this.originalSchema)
    },
    setEditField(key) {
      this.editField = key
      // cf https://learn.jquery.com/using-jquery-core/faq/how-do-i-select-an-element-by-an-id-that-has-characters-used-in-css-notation/
      this.$nextTick(() => document.querySelector('#description-' + key.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1')).focus())
    },
    addProperty() {
      if (this.$refs.addPropertyForm.validate()) {
        this.schema.push({ key: this.newPropertyKey, ...this.newPropertyType, title: '' })
        this.addPropertyDialog = false
      }
    },
    addAttachmentProperty() {
      this.schema.push({ key: 'attachmentPath', type: 'string', title: 'Pièce jointe', 'x-refersTo': 'http://schema.org/DigitalDocument' })
    },
    save() {
      this.patchAndCommit({ schema: this.schema.map(field => Object.assign({}, field)) })
    },
    onMetadataUpload(e) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const infos = JSON.parse(event.target.result)
        // TODO check format is compliant with https://frictionlessdata.io/specs/table-schema/
        infos.fields.forEach(f => {
          const field = this.schema.find(sf => sf.key === f.name)
          if (field) {
            if (f.title) this.$set(field, 'title', f.title)
            if (f.description) this.$set(field, 'description', f.description)
          }
        })
        this.$refs.schemaInput.value = ''
      }
      reader.readAsText(e.target.files[0])
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
