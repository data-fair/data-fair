<template>
  <v-row>
    <v-col>
      <v-row class="px-3 pb-1 ma-0">
        <h3
          v-if="notCalculatedProperties"
          class="text-h6"
        >
          {{ notCalculatedProperties.length.toLocaleString() }} {{ $t('column') }}{{ notCalculatedProperties.length > 1 ? 's' : '' }}
        </h3>
        <v-btn
          v-if="dataset.isRest && can('writeDescriptionBreaking')"
          color="primary"
          fab
          x-small
          class="mx-2"
          @click="addPropertyDialog = true"
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
          class="mx-3 mb-2"
          hide-details
        />
        <v-spacer />
        <div>
          <v-btn
            v-if="updated"
            v-t="'cancelChanges'"
            text
            @click="resetSchema"
          />
          <v-btn
            v-if="updated && can('writeDescription')"
            v-t="'apply'"
            color="primary"
            @click="save"
          />
        </div>
      </v-row>

      <v-row
        v-if="notCalculatedProperties && notCalculatedProperties.length && dataset.isRest"
        class="mt-0 mb-2"
      >
        <v-col class="pt-0">
          <v-select
            v-model="primaryKey"
            :label="$t('primaryKey')"
            :disabled="!!dataset.count || !can('writeDescriptionBreaking')"
            :messages="dataset.count ? $t('primaryKeyMsgData') : $t('primaryKeyMsgNoData')"
            :items="notCalculatedProperties.map(p => ({text: p.title || p['x-originalName'] || p.key, value: p.key}))"
            style="max-width: 500px;"
            multiple
          />
        </v-col>
      </v-row>

      <tutorial-alert
        v-if="can('writeDescriptionBreaking') && dataset.isRest"
        id="sort-properties"
        :text="$t('sortProperties')"
        persistent
      />

      <dataset-properties-slide
        v-if="schema && schema.length"
        :properties-refs="filteredProperties"
        :editable="can('writeDescription')"
        :no-breaking-changes="!can('writeDescriptionBreaking')"
        :sortable="can('writeDescription') && (dataset.isRest || dataset.file) && !schemaFilter"
        @sort="applySort"
        @remove="removeProperty"
      />
    </v-col>

    <dataset-add-property-dialog
      v-model="addPropertyDialog"
      :schema="schema"
      @add="addProperty"
    />
  </v-row>
</template>

<i18n lang="yaml">
fr:
  cancelChanges: Annuler les modifications
  apply: Appliquer
  primaryKey: Clé primaire
  primaryKeyMsgData: La clé primaire ne peut pas être modifiée une fois que des données ont été insérées.
  primaryKeyMsgNoData: Optionnel. Utilisez une ou plusieurs colonnes du schéma pour construire une clé primaire qui identifiera de manière unique chaque ligne de la donnée.
  validate: Valider
  sortProperties: Vous pouvez changer l'ordre des colonnes par glissé-déposé
  column: colonne
en:
  cancelChanges: Cancel modifications
  apply: Apply
  primaryKey: Clé primaire
  primaryKeyMsgData: The primary key cannot be changed one data has been inserted.
  primaryKeyMsgNoData: Optional. Use one or more columns of the schéma to build a primary key that will identify in a unique manner each line of the data.
  validate: Validate
  sortProperties: You can sort the columns by drag and drop
  column: column
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  data: () => ({
    schema: [],
    schemaFilter: '',
    editField: null,
    originalSchema: null,
    addPropertyDialog: false,
    primaryKey: null
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset', 'validatedDataset']),
    ...mapGetters('dataset', ['can']),
    updated () {
      return JSON.stringify(this.schema) !== this.originalSchema ||
          JSON.stringify(this.primaryKey || []) !== JSON.stringify(this.dataset.primaryKey || [])
    },
    originalProperties () {
      return this.originalSchema && JSON.parse(this.originalSchema)
    },
    notCalculatedProperties () {
      return this.schema.filter(p => !p['x-calculated'])
    },
    filterableProperties () {
      const props = []
      // WARNING the warning managmeent is kind of a duplicate of the breaking changes management in server/routers/datasets.js
      if (this.validatedDataset && this.validatedDataset.schema) {
        this.validatedDataset.schema.forEach(vp => {
          if (!vp['x-calculated'] && !this.notCalculatedProperties.find(p => vp.key === p.key)) {
            props.push({
              key: vp.key,
              search: `${(vp.title || '').toLowerCase()} ${(vp['x-originalName'] || '').toLowerCase()} ${vp.key.toLowerCase()}`,
              prop: vp,
              originalProp: vp,
              editable: false,
              warning: this.dataset.draftReason.key === 'file-new' ? 'Cette colonne n\'apparait pas dans le fichier mais est attendue par le schéma.' : 'Cette colonne n\'apparait plus dans la nouvelle version du fichier.'
            })
          }
        })
      }
      if (this.originalProperties && this.dataset.isRest) {
        this.originalProperties.forEach(vp => {
          if (!vp['x-calculated'] && !this.notCalculatedProperties.find(p => vp.key === p.key)) {
            props.push({
              key: vp.key,
              search: `${(vp.title || '').toLowerCase()} ${(vp['x-originalName'] || '').toLowerCase()} ${vp.key.toLowerCase()}`,
              prop: vp,
              originalProp: vp,
              editable: false,
              warning: 'Cette colonne sera supprimée.'
            })
          }
        })
      }
      return props.concat(this.notCalculatedProperties.map(p => {
        const validatedProp = this.validatedDataset && this.validatedDataset.schema && this.validatedDataset.schema.find(vp => vp.key === p.key)
        let warning
        if (validatedProp) {
          if (validatedProp.type !== p.type) {
            warning = this.dataset.draftReason.key === 'file-new' ? 'Cette colonne n\'a pas le type attendu par le schéma' : 'Cette colonne a changé de type dans la nouvelle version du fichier.'
          }
          const format = (p.format && p.format !== 'uri-reference') ? p.format : null
          const validatedFormat = (validatedProp.format && validatedProp.format !== 'uri-reference') ? validatedProp.format : null
          if (validatedProp.type === 'string' && p.type === 'string' && validatedFormat !== format) {
            warning = this.dataset.draftReason.key === 'file-new' ? 'Cette colonne n\'a pas le type attendu par le schéma' : 'Cette colonne a changé de type dans la nouvelle version du fichier.'
          }
        }
        return {
          key: p.key,
          search: `${(p.title || '').toLowerCase()} ${(p['x-originalName'] || '').toLowerCase()} ${p.key.toLowerCase()}`,
          prop: p,
          originalProp: this.originalProperties.find(op => op.key === p.key),
          validatedProp,
          editable: !(p['x-extension'] && p['x-extension'] !== p.key) && !p.key.startsWith('_'),
          warning
        }
      }))
    },
    filteredProperties () {
      const filter = this.schemaFilter && this.schemaFilter.toLowerCase()
      return this.filterableProperties
        .filter(fp => !filter || (fp.search.includes(filter) || JSON.stringify(fp.prop) !== JSON.stringify(fp.originalProp)))
    }
  },
  watch: {
    'dataset.schema' () {
      this.initSchema()
    }
  },
  mounted () {
    if (this.dataset) {
      this.initSchema()
    }
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit']),
    initSchema () {
      const originalSchema = JSON.stringify(this.dataset && this.dataset.schema)
      if (this.originalSchema === originalSchema) return
      this.originalSchema = originalSchema
      this.schema = this.dataset.schema.map(field => Object.assign({}, field))
      this.dataset.primaryKey = this.dataset.primaryKey || []
      this.primaryKey = this.dataset.primaryKey.filter(k => !!this.schema.find(p => p.key === k))
      this.dataset.extensions = this.dataset.extensions || []
    },
    resetSchema () {
      this.schema = JSON.parse(this.originalSchema)
    },
    setEditField (key) {
      this.editField = key
      // cf https://learn.jquery.com/using-jquery-core/faq/how-do-i-select-an-element-by-an-id-that-has-characters-used-in-css-notation/
      this.$nextTick(() => document.querySelector('#description-' + key.replace(/(:|\.|\[|\]|,|=|@)/g, '\\$1')).focus())
    },
    addProperty (property) {
      this.schema.push(property)
    },
    removeProperty (property) {
      this.schema = this.schema.filter(p => p.key !== property.key)
    },
    save () {
      const patch = {}
      if (JSON.stringify(this.schema) !== this.originalSchema) {
        patch.schema = this.schema.map(field => ({ ...field }))
      }
      if (JSON.stringify(this.primaryKey || []) !== JSON.stringify(this.dataset.primaryKey || [])) {
        patch.primaryKey = [...this.primaryKey]
      }
      this.patchAndCommit(patch)
    },
    applySort (sorted) {
      this.schema = sorted.map(s => this.schema.find(p => p.key === s.key))
        .concat(this.schema.filter(p => !sorted.find(s => p.key === s.key)))
    }
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
