<template lang="html">

  <v-layout column>
    <h3 v-if="data.total <= 10000">Consultez {{ data.total.toLocaleString() }} {{ plural ? `résultats d'extension` : `résultat d'extension` }}</h3>
    <h3 v-if="data.total > 10000">Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} premiers résultats d'extension ({{ data.total.toLocaleString() }} au total)</h3>
    <v-layout row>
      <p v-if="nbErrors === 0">Il n'y a aucune erreur dans le retour de l'extension.</p>
      <v-checkbox v-if="nbErrors !== null && nbErrors > 0" :label="`Voir uniquement les ${nbErrors} erreurs`" v-model="onlyErrors"/>
    </v-layout>
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
          :items="[5,10,20,50]"
          v-model="pagination.rowsPerPage"
          label="Nombre de lignes"
        />
      </v-flex>
      <v-pagination v-if="data.total > pagination.rowsPerPage" v-model="pagination.page" :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)" :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5" class="mx-4"/>
    </v-layout>

    <v-data-table v-if="headers" :headers="headers" :items="data.results" :total-items="data.total" :loading="loading" :pagination.sync="pagination" hide-actions class="elevation-1">
      <template slot="headers" slot-scope="props">
        <tr style="height: 30px;border-bottom: 2px solid rgba(0,0,0,0.24);">
          <th :colspan="inputFields.length" class="column text-xs-left" style="border-right: 2px solid rgba(0,0,0,0.24);">
            <span style="font-weight: bold;">Entrées</span>
          </th>
          <th :colspan="outputFields.length" class="column text-xs-left">
            <span style="font-weight: bold;">Résultats</span>
          </th>
        </tr>
        <tr style="border-bottom: 2px solid rgba(0,0,0,0.24);">
          <th
            v-for="(header, i) in headers"
            :key="header.text"
            :class="['column text-xs-left', header.sortable ? 'sortable' : '', pagination.descending ? 'desc' : 'asc', header.value === pagination.sortBy ? 'active' : '']"
            :style="i === inputFields.length - 1 ? 'border-right: 2px solid rgba(0,0,0,0.24);' : ''"
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
        <tr :style="!!props.item[errorField.key] ? 'background-color: #FFCDD2' : ''">
          <td
            v-for="(header, i) in headers"
            :key="header.value"
            :style="i === inputFields.length - 1 ? 'border-right: 2px solid rgba(0,0,0,0.24);' : ''">
            {{ ((props.item[header.value] === undefined || props.item[header.value] === null ? '' : props.item[header.value]) + '') | truncate(50) }}
          </td>
        </tr>
      </template>
    </v-data-table>
  </v-layout>
</template>

<script>
import eventBus from '../event-bus'
const { mapState, mapGetters } = require('vuex')

export default {
  props: ['remoteService', 'action'],
  data: () => ({
    data: {},
    query: null,
    pagination: {
      page: 1,
      rowsPerPage: 5,
      sortBy: '_i',
      descending: false
    },
    loading: false,
    onlyErrors: false,
    nbErrors: null
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl', 'remoteServicesMap']),
    extension() {
      return this.dataset && this.dataset.extensions.find(e => e.remoteService === this.remoteService && e.action === this.action)
    },
    remoteServiceObj() {
      return this.remoteServicesMap[this.remoteService]
    },
    actionObj() {
      return this.remoteServiceObj && this.remoteServiceObj.actions[this.action]
    },
    inputFields() {
      if (!this.actionObj) return
      return this.dataset.schema.filter(f => f['x-refersTo'] && this.actionObj.input.find(i => i.concept === f['x-refersTo']))
    },
    outputFields() {
      if (!this.actionObj) return
      return this.dataset.schema
        .filter(f => f['x-extension'] === `${this.remoteService}/${this.action}`)
    },
    errorField() {
      return this.outputFields && this.outputFields.find(f => f['x-originalName'] === 'error')
    },
    selectFields() {
      if (!this.inputFields || !this.outputFields) return
      return this.inputFields.concat(this.outputFields)
    },
    headers() {
      return this.selectFields && this.selectFields
        .map(field => ({
          text: field.title || field['x-originalName'] || field.key,
          value: field.key
        }))
    },
    plural() {
      return this.data.total > 1
    }
  },
  watch: {
    selectFields: {
      handler() {
        if (this.selectFields) this.refresh()
      },
      immediate: true
    },
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    },
    onlyErrors() {
      this.refresh()
    }
  },
  methods: {
    async refresh() {
      const params = {
        size: this.pagination.rowsPerPage,
        page: this.pagination.page
      }
      if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
      if (this.query) params.q = this.query
      if (this.onlyErrors) params.qs = `_exists_:${this.errorField.key}`
      params.select = this.selectFields.map(f => f.key).join(',')
      this.loading = true
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
        this.notFound = false
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des données` })
      }
      try {
        this.nbErrors = (await this.$axios.$get(this.resourceUrl + '/lines', { params: { size: 0, q: params.q, qs: `_exists_:${this.errorField.key}` } })).total
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant le comptage des erreurs` })
      }
      this.loading = false
    }
  }
}
</script>

<style lang="css">
</style>
