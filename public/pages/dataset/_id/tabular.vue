<template>
  <v-container fluid>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">le journal</nuxt-link> pour en savoir plus.</p>
    </div>
    <v-card>
      <v-card-title>
        <v-layout column>
          <h3 v-if="data.total <= 10000">Consultez {{ data.total.toLocaleString() }} {{ plural ? 'enregistrements' : 'enregistrement' }}</h3>
          <h3 v-if="data.total > 10000">Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} {{ plural ? 'premiers enregistrements' : 'premier enregistrement' }} ({{ data.total.toLocaleString() }} au total)</h3>
          <div>
            <v-btn v-if="dataset.isRest && can('writeData')" color="primary" @click="editedLine = null; showEditLineDialog();">
              Ajouter une ligne
            </v-btn>
          </div>
          <v-layout row wrap>
            <v-flex lg3 md4 sm5 xs12>
              <v-text-field
                v-model="query"
                label="Rechercher"
                append-icon="search"
                class="mr-3"
                style="min-width:150px;"
                @keyup.enter.native="refresh"
                @click:append="refresh"/>
            </v-flex>
            <v-spacer/>
            <v-flex v-show="$vuetify.breakpoint.mdAndUp" xl1 lg1 md2>
              <v-select
                :items="[10,20,50]"
                v-model="pagination.rowsPerPage"
                label="Nombre de lignes"
              />
            </v-flex>
            <v-pagination v-if="data.total > pagination.rowsPerPage" v-model="pagination.page" :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)" :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5" class="mx-4"/>
          </v-layout>
        </v-layout>
      </v-card-title>

      <v-data-table :headers="headers" :items="data.results" :total-items="data.total" :loading="loading" :pagination.sync="pagination" hide-actions>
        <template slot="headers" slot-scope="props">
          <tr>
            <th
              v-for="header in headers"
              :key="header.text"
              :class="['column text-xs-left', header.sortable ? 'sortable' : '', pagination.descending ? 'desc' : 'asc', header.value === pagination.sortBy ? 'active' : '']"
            >
              <v-tooltip v-if="header.tooltip" bottom style="margin-right: 8px;">
                <span slot="activator"><v-icon small>info</v-icon></span>
                <span>{{ header.tooltip }}</span>
              </v-tooltip>
              <span @click="orderBy(header)">
                {{ header.text }}
                <v-icon v-if="header.sortable" small>arrow_upward</v-icon>
              </span>
            </th>
          </tr>
        </template>
        <template slot="items" slot-scope="props">
          <td v-for="header in headers" :key="header.value">
            <template v-if="header.value === '_actions'">
              <v-btn flat icon color="warning" title="Supprimer cette ligne" @click="editedLine = Object.assign({}, props.item); deleteLineDialog = true;">
                <v-icon>delete</v-icon>
              </v-btn>
              <v-btn flat icon color="primary" title="Éditer cette ligne" @click="editedLine = Object.assign({}, props.item); showEditLineDialog();">
                <v-icon>edit</v-icon>
              </v-btn>
            </template>
            <template v-else>
              {{ ((props.item[header.value] === undefined || props.item[header.value] === null ? '' : props.item[header.value]) + '') | truncate(50) }}
            </template>
          </td>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="editLineDialog" max-width="500px">
      <v-card>
        <v-card-title primary-title>
          Éditer une ligne
        </v-card-title>
        <v-card-text>
          <v-form ref="editLineForm" :lazy-validation="true">
            <v-jsonschema-form v-if="editLineDialog && editedLine" :schema="jsonSchema" :model="editedLine" :options="{requiredMessage: 'Information obligatoire', noDataMessage: 'Aucune valeur correspondante', 'searchMessage': 'Recherchez...'}" @error="error => eventBus.$emit('notification', {error})" />

            <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
              <p>Chargez un fichier en pièce jointe.</p>
              <div class="mt-3 mb-3"><input type="file" @change="onFileUpload"></div>
              <v-progress-linear v-model="uploadProgress"/>
            </template>

          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="editLineDialog = false">Annuler</v-btn>
          <v-btn color="primary" @click="saveLine">Enregistrer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteLineDialog" max-width="500px">
      <v-card>
        <v-card-title primary-title>
          Supprimer une ligne
        </v-card-title>
        <v-card-text>
          <v-alert :value="true" type="error">
            Attention la donnée de cette ligne sera perdue définitivement.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="deleteLineDialog = false">Annuler</v-btn>
          <v-btn color="warning" @click="deleteLine">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '../../../event-bus'
import VJsonschemaForm from '@koumoul/vuetify-jsonschema-form/lib/index.vue'
import '@koumoul/vuetify-jsonschema-form/dist/main.css'

export default {
  components: { VJsonschemaForm },
  data: () => ({
    data: {},
    query: null,
    select: [],
    pagination: {
      page: 1,
      rowsPerPage: 10,
      sortBy: '_i',
      descending: false
    },
    sort: null,
    notFound: false,
    loading: false,
    editLineDialog: false,
    editedLine: null,
    editedId: null,
    deleteLineDialog: false,
    file: null,
    uploadProgress: 0
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl', 'can']),
    headers() {
      const fieldsHeaders = this.dataset.schema
        .filter(field => !field['x-calculated'])
        .filter(field => !this.select.length || this.select.includes(field.key))
        .map(field => ({
          text: field.title || field['x-originalName'] || field.key,
          value: field.key,
          sortable: field.type === 'string' || field.type === 'number' || field.type === 'integer',
          tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description)
        }))

      if (this.dataset.isRest && this.can('writeData')) {
        return [{ text: '', value: '_actions' }].concat(fieldsHeaders)
      } else {
        return fieldsHeaders
      }
    },
    plural() {
      return this.data.total > 1
    },
    jsonSchema() {
      return {
        type: 'object',
        properties: this.dataset.schema
          .filter(f => !f['x-calculated'])
          .filter(f => f['x-refersTo'] !== 'http://schema.org/DigitalDocument')
          // .map(f => ({ ...f, maxLength: 10000 }))
          .reduce((a, f) => { a[f.key] = f; return a }, {})
      }
    }
  },
  watch: {
    'dataset.schema'() {
      this.refresh()
    },
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      // this.data = {}
      const params = {
        size: this.pagination.rowsPerPage,
        page: this.pagination.page
      }
      if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
      if (this.query) params.q = this.query
      if (this.select.length) params.select = this.select.join(',')
      this.loading = true
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
        this.notFound = false
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des données` })
      }
      this.loading = false
    },
    orderBy(header) {
      if (!header.sortable) return
      if (this.pagination.sortBy === header.value) {
        this.pagination.descending = !this.pagination.descending
      } else {
        this.pagination.sortBy = header.value
        this.pagination.descending = true
      }
    },
    showEditLineDialog() {
      this.$refs.editLineForm.resetValidation()
      if (!this.editedLine) {
        this.editedId = null
        this.file = null
        this.editedLine = {}
        this.dataset.schema.filter(f => !f['x-calculated']).forEach(f => {
          this.$set(this.editedLine, f.key, null)
        })
      } else {
        this.editedId = this.editedLine._id
      }
      this.uploadProgress = 0
      this.editLineDialog = true
    },
    onFileUpload(e) {
      this.file = e.target.files[0]
    },
    async saveLine() {
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            console.log('LOADED', e.loaded)
            this.uploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      const formData = new FormData()
      if (this.file) formData.append('attachment', this.file)

      this.dataset.schema.filter(f => !f['x-calculated']).forEach(f => {
        if (this.editedLine[f.key] !== null) formData.append([f.key], this.editedLine[f.key])
      })
      if (this.editedId) formData.append('_id', this.editedId)
      this.editLineDialog = false
      try {
        await this.$axios.$post(this.resourceUrl + '/lines', formData, options)
        console.log('POST OK')
        await new Promise(resolve => setTimeout(resolve, 1000))
        this.refresh()
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant l'enregistrement de la ligne'` })
      }
    },
    async deleteLine() {
      try {
        await this.$axios.$delete(this.resourceUrl + '/lines/' + this.editedLine._id)
        this.deleteLineDialog = false
        await new Promise(resolve => setTimeout(resolve, 1000))
        this.refresh()
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant la suppression de la ligne'` })
      }
    }
  }
}
</script>
