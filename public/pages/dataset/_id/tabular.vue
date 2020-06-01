<template>
  <v-container fluid>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>
        Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">
          le journal
        </nuxt-link> pour en savoir plus.
      </p>
    </div>
    <v-sheet>
      <v-row>
        <v-col>
          <v-row class="px-3">
            <h3 v-if="data.total <= 10000" class="headline">
              Consultez {{ data.total.toLocaleString() }} {{ plural ? 'enregistrements' : 'enregistrement' }}
            </h3>
            <h3 v-if="data.total > 10000" class="headline">
              Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} {{ plural ? 'premiers enregistrements' : 'premier enregistrement' }} ({{ data.total.toLocaleString() }} au total)
            </h3>
            <v-btn
              v-if="dataset.isRest && can('writeData')"
              color="primary"
              fab
              x-small
              class="mx-2"
              @click="editedLine = null; showEditLineDialog();"
            >
              <v-icon>                mdi-plus              </v-icon>
            </v-btn>
          </v-row>
          <v-row>
            <v-col
              lg="3"
              md="4"
              sm="5"
              cols="12"
            >
              <v-text-field
                v-model="query"
                label="Rechercher"
                append-icon="mdi-magnify"
                class="mr-3"
                style="min-width:150px;"
                @keyup.enter.native="refresh(true)"
                @click:append="refresh(true)"
              />
            </v-col>
            <v-spacer />
            <v-col
              v-show="$vuetify.breakpoint.mdAndUp"
              xl="1"
              lg="1"
              md="2"
            >
              <v-select
                v-model="pagination.rowsPerPage"
                :items="[10,20,50]"
                label="Nombre de lignes"
              />
            </v-col>
            <v-pagination
              v-if="data.total > pagination.rowsPerPage"
              v-model="pagination.page"
              :length="Math.floor(Math.min(data.total, 10000) / pagination.rowsPerPage)"
              :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5"
              class="mx-4"
            />
          </v-row>
        </v-col>
      </v-row>

      <v-data-table
        :headers="headers"
        :items="data.results"
        :server-items-length="data.total"
        :loading="loading"
        :options.sync="pagination"
        hide-default-footer
        hide-default-header
      >
        <template v-slot:header>
          <thead class="v-data-table-header">
            <tr>
              <th
                v-for="header in headers"
                :key="header.value"
                :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy, asc: !pagination.descending, desc: !pagination.descending}"
                nowrap
                @click="orderBy(header)"
              >
                <v-tooltip
                  v-if="header.tooltip"
                  bottom
                  style="margin-right: 8px;"
                >
                  <template v-slot:activator="{ on }">
                    <v-icon small v-on="on">
                      mdi-information
                    </v-icon>
                  </template>
                  <span>{{ header.tooltip }}</span>
                </v-tooltip>
                <span>
                  {{ header.text }}
                </span>
                <v-icon
                  v-if="header.sortable"
                  class="v-data-table-header__icon"
                  small
                >
                  mdi-arrow-up
                </v-icon>
              </th>
            </tr>
          </thead>
        </template>
        <template v-slot:item="{item}">
          <tr>
            <td
              v-for="header in headers"
              :key="header.value"
              class="pr-0 pl-4"
            >
              <div v-if="header.value === '_actions'" style="min-width:120px;">
                <v-btn
                  icon
                  color="warning"
                  title="Supprimer cette ligne"
                  @click="editedLine = Object.assign({}, item); deleteLineDialog = true;"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
                <v-btn
                  icon
                  color="primary"
                  title="Éditer cette ligne"
                  @click="editedLine = Object.assign({}, item); showEditLineDialog();"
                >
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
                <v-btn
                  v-if="dataset.rest && dataset.rest.history"
                  icon
                  color="primary"
                  title="Voir l'historique des révisions de cette ligne"
                  @click="showHistoryDialog(item)"
                >
                  <v-icon>mdi-history</v-icon>
                </v-btn>
              </div>
              <template v-else-if="header.value === '_thumbnail'">
                <v-avatar
                  v-if="item._thumbnail"
                  tile
                  :size="40"
                >
                  <img :src="item._thumbnail">
                </v-avatar>
              </template>
              <template v-else-if="digitalDocumentField && digitalDocumentField.key === header.value">
                <a v-if="item._attachment_url" :href="item._attachment_url">{{ item[header.value] }}</a>
              </template>
              <template v-else>
                {{ ((item[header.value] === undefined || item[header.value] === null ? '' : item[header.value]) + '') | truncate(50) }}
              </template>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-sheet>

    <v-dialog
      v-model="editLineDialog"
      max-width="500px"
    >
      <v-card>
        <v-card-title primary-title>
          Éditer une ligne
        </v-card-title>
        <v-card-text>
          <v-form
            ref="editLineForm"
            :lazy-validation="true"
          >
            <v-jsf
              v-if="editLineDialog && editedLine"
              v-model="editedLine"
              :schema="jsonSchema"
              :options="{removeAdditionalProperties: true}"
            />

            <template v-if="dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')">
              <p>Chargez un fichier en pièce jointe.</p>
              <div class="mt-3 mb-3">
                <input
                  type="file"
                  @change="onFileUpload"
                >
              </div>
              <v-progress-linear v-model="uploadProgress" />
            </template>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="editLineDialog = false">
            Annuler
          </v-btn>
          <v-btn color="primary" @click="saveLine">
            Enregistrer
          </v-btn>
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
          <v-spacer />
          <v-btn text @click="deleteLineDialog = false">
            Annuler
          </v-btn>
          <v-btn color="warning" @click="deleteLine">
            Supprimer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="historyDialog" max-width="800px">
      <v-card>
        <v-toolbar dense flat>
          <v-toolbar-title>Historique des révisions</v-toolbar-title>
          <v-spacer />
          <v-btn icon @click.native="historyDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text v-if="history" class="pa-0">
          <v-data-table
            :headers="historyHeaders"
            :items="history.results"
            :server-items-length="history.total"
            rows-per-page-text="Nombre de révisions"
            :loading="historyLoading"
            :options.sync="historyPagination"
          >
            <template v-slot:item="{item}">
              <tr>
                <td
                  v-for="header in historyHeaders"
                  :key="header.value"
                  class="pr-0 pl-4"
                >
                  <template v-if="header.value === '_updatedAt'">
                    {{ new Date(item._updatedAt).toLocaleString() }}
                  </template>
                  <template v-else>
                    {{ ((item[header.value] === undefined || item[header.value] === null ? '' : item[header.value]) + '') | truncate(50) }}
                  </template>
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'
  import VJsf from '@koumoul/vjsf/lib/VJsf.js'
  import '@koumoul/vjsf/dist/main.css'

  export default {
    components: { VJsf },
    data: () => ({
      data: {},
      query: null,
      select: [],
      pagination: {
        page: 1,
        rowsPerPage: 10,
        sortBy: null,
        descending: false,
      },
      sort: null,
      notFound: false,
      loading: false,
      editLineDialog: false,
      editedLine: null,
      editedId: null,
      deleteLineDialog: false,
      file: null,
      uploadProgress: 0,
      historyLine: null,
      historyDialog: false,
      history: null,
      historyLoading: false,
      historyPagination: {
        page: 1,
        rowsPerPage: 10,
      },
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
            tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description),
          }))

        if (this.imageField) {
          fieldsHeaders.unshift({ text: '', value: '_thumbnail' })
        }
        if (this.dataset.isRest && this.can('writeData')) {
          fieldsHeaders.unshift({ text: '', value: '_actions' })
        }
        return fieldsHeaders
      },
      historyHeaders() {
        const historyHeaders = this.headers
          .map(h => ({ ...h, sortable: false }))
          .filter(h => !h.value.startsWith('_'))
        historyHeaders.unshift({ text: 'Date de la révision', value: '_updatedAt', sortable: false })
        return historyHeaders
      },
      plural() {
        return this.data.total > 1
      },
      imageField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
      },
      digitalDocumentField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      jsonSchema() {
        return {
          type: 'object',
          properties: this.dataset.schema
            .filter(f => !f['x-calculated'])
            .filter(f => !f['x-extension'])
            .filter(f => f['x-refersTo'] !== 'http://schema.org/DigitalDocument')
            // .map(f => ({ ...f, maxLength: 10000 }))
            .reduce((a, f) => { a[f.key] = f; return a }, {}),
        }
      },
    },
    watch: {
      'dataset.schema'() {
        this.refresh(true)
      },
      pagination: {
        handler () {
          this.refresh()
        },
        deep: true,
      },
      historyPagination: {
        handler () {
          if (this.historyLine) this.refreshHistory()
        },
        deep: true,
      },
    },
    mounted() {
      this.refresh()
    },
    methods: {
      async refresh(resetPagination) {
        if (resetPagination) this.pagination.page = 1
        // this.data = {}
        const params = {
          size: this.pagination.rowsPerPage,
          page: this.pagination.page,
        }
        if (this.imageField) params.thumbnail = '40x40'
        if (this.pagination.sortBy) {
          params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
        }
        if (this.query) params.q = this.query
        if (this.select.length) params.select = this.select.join(',')
        this.loading = true
        try {
          this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
          this.notFound = false
        } catch (error) {
          if (error.response && error.response.status === 404) this.notFound = true
          else eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
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
      showHistoryDialog(line) {
        this.historyLine = line
        this.history = null
        this.historyDialog = true
        this.historyPagination.page = 1

        this.refreshHistory()
      },
      async refreshHistory() {
        this.historyLoading = true
        try {
          this.history = await this.$axios.$get(`${this.resourceUrl}/lines/${this.historyLine._id}/revisions`, {
            params: {
              page: this.historyPagination.page,
              size: this.historyPagination.rowsPerPage,
            },
          })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération de l\'historique de la ligne\'' })
        }
        this.historyLoading = false
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
          },
        }
        const formData = new FormData()
        if (this.file) formData.append('attachment', this.file)

        this.dataset.schema.filter(f => !f['x-calculated'] && !f['x-extension']).forEach(f => {
          if (this.editedLine[f.key] !== null && this.editedLine[f.key] !== undefined) formData.append([f.key], this.editedLine[f.key])
        })
        if (this.editedId) formData.append('_id', this.editedId)
        this.editLineDialog = false
        try {
          await this.$axios.$post(this.resourceUrl + '/lines', formData, options)
        } catch (error) {
          if (error.response && error.response.status === 404) this.notFound = true
          else eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'enregistrement de la ligne\'' })
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
          else eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression de la ligne\'' })
        }
      },
    },
  }
</script>
