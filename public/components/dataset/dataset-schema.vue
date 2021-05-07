<template>
  <v-row>
    <v-col class="py-0">
      <v-row class="px-3 pb-1" style="height:44px;">
        <h3 v-if="notCalculatedProperties" class="text-h6">
          {{ notCalculatedProperties.length.toLocaleString() }} colonne{{ notCalculatedProperties.length > 1 ? 's' : '' }}
        </h3>
        <v-btn
          v-if="dataset.isRest && can('writeDescription')"
          color="primary"
          fab
          x-small
          class="mx-2"
          @click="newPropertyKey = null; newPropertyType = null; addPropertyDialog = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
        <v-text-field
          v-if="notCalculatedProperties && notCalculatedProperties.length > 10"
          v-model="schemaFilter"
          placeholder="Rechercher"
          outlined
          rounded
          dense
          style="max-width:180px;"
          append-icon="mdi-magnify"
          class="mx-3"
        />
        <v-spacer />
        <div>
          <v-btn
            v-if="updated"
            text
            @click="resetSchema"
          >
            Annuler les modifications
          </v-btn>
          <v-btn
            v-if="updated"
            color="primary"
            @click="save"
          >
            Appliquer
          </v-btn>
        </div>
      </v-row>

      <v-row v-if="notCalculatedProperties && notCalculatedProperties.length">
        <v-col>
          <v-select
            v-model="primaryKey"
            label="Clé primaire"
            :disabled="!!dataset.count || !can('writeDescription')"
            :messages="dataset.count ? 'La clé primaire ne peut pas être modifiée une fois que des données ont été insérées.' : 'Optionnel. Utilisez une ou plusieurs colonnes du schéma pour construire une clé primaire qui identifiera de manière unique chaque ligne de la donnée.'"
            :items="notCalculatedProperties.map(p => ({text: p.title || p['x-originalName'] || p.key, value: p.key}))"
            style="max-width: 500px;"
            multiple
          />
        </v-col>
      </v-row>

      <dataset-properties-slide
        v-if="schema && schema.length"
        :properties="filteredProperties"
        :original-properties="originalProperties"
        :editable="can('writeDescription')"
      />
    </v-col>

    <v-dialog
      v-model="addPropertyDialog"
      max-width="500px"
    >
      <v-card outlined>
        <v-card-title primary-title>
          Ajouter une propriété
        </v-card-title>
        <v-card-text>
          <v-form
            ref="addPropertyForm"
            :lazy-validation="true"
          >
            <v-text-field
              v-model="newPropertyKey"
              :rules="[v => !!v || '', v => !schema.find(f => f.key === v) || '']"
              name="key"
              label="Clé"
            />
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
          <v-btn text @click="addPropertyDialog = false">
            Annuler
          </v-btn>
          <v-btn color="primary" @click="addProperty">
            Valider
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script>
  import { mapState, mapActions, mapGetters } from 'vuex'
  export default {
    data: () => ({
      schema: [],
      schemaFilter: '',
      editField: null,
      originalSchema: null,
      addPropertyDialog: false,
      newPropertyKey: null,
      newPropertyType: null,
      primaryKey: null,
    }),
    computed: {
      ...mapState(['vocabulary', 'propertyTypes']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['can']),
      updated() {
        return JSON.stringify(this.schema) !== this.originalSchema ||
          JSON.stringify(this.primaryKey) !== JSON.stringify(this.dataset.primaryKey)
      },
      originalProperties() {
        return JSON.parse(this.originalSchema)
      },
      notCalculatedProperties() {
        return this.schema.filter(p => !p['x-calculated'])
      },
      filterableProperties() {
        return this.notCalculatedProperties.map(p => ({
          key: p.key,
          search: `${(p.title || '').toLowerCase()} ${(p['x-originalName'] || '').toLowerCase()} ${p.key.toLowerCase()}`,
          prop: p,
        }))
      },
      filteredProperties() {
        if (!this.schemaFilter) return this.notCalculatedProperties
        const filter = this.schemaFilter.toLowerCase()
        return this.filterableProperties
          .filter(fp => fp.search.includes(filter) || JSON.stringify(fp.prop) !== JSON.stringify(this.originalProperties.find(p => p.key === fp.key)))
          .map(fp => fp.prop)
      },
    },
    watch: {
      'dataset.schema'() {
        this.initSchema()
      },
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
        this.dataset.primaryKey = this.dataset.primaryKey || []
        this.primaryKey = this.dataset.primaryKey.filter(k => !!this.schema.find(p => p.key === k))
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
      save() {
        this.patchAndCommit({ schema: this.schema.map(field => Object.assign({}, field)), primaryKey: [...this.primaryKey] })
      },
      /* onMetadataUpload(e) {
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
      }, */
    },
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
