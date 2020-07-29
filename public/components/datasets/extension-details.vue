<template lang="html">
  <v-row>
    <v-col>
      <h3 v-if="data.total <= 10000">
        Consultez {{ data.total.toLocaleString() }} {{ plural ? `résultats d'extension` : `résultat d'extension` }}
      </h3>
      <h3 v-if="data.total > 10000">
        Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} premiers résultats d'extension ({{ data.total.toLocaleString() }} au total)
      </h3>
      <v-row>
        <p v-if="nbErrors === 0">
          Il n'y a aucune erreur dans le retour de l'extension.
        </p>
        <v-col
          lg="3"
          md="4"
          sm="5"
          cols="12"
        >
          <v-select
            v-if="nbErrors !== null && nbErrors > 0"
            v-model="errorMode"
            :items="errorModes"
            hide-details
          />
        </v-col>
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
            solo
            @keyup.enter.native="refresh"
            @click:append="refresh"
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
            v-model="pagination.itemsPerPage"
            :items="[5,10,20,50]"
            label="Nombre de lignes"
          />
        </v-col>
        <v-pagination
          v-if="data.total > pagination.itemsPerPage"
          v-model="pagination.page"
          circle
          :length="Math.ceil(Math.min(data.total, 10000) / pagination.itemsPerPage)"
          :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5"
          class="mx-4"
        />
      </v-row>

      <v-data-table
        v-if="headers"
        :headers="headers"
        :items="data.results"
        :server-items-length="data.total"
        :loading="loading"
        :options.sync="pagination"
        hide-default-header
        hide-default-footer
      >
        <template v-slot:header>
          <tr style="height: 30px;border-bottom: 2px solid rgba(0,0,0,0.24);">
            <th
              :colspan="inputFields.length"
              class="column text-left"
              style="border-right: 2px solid rgba(0,0,0,0.24);"
            >
              <span style="font-weight: bold;">Entrées</span>
            </th>
            <th
              :colspan="outputFields.length"
              class="column text-left"
            >
              <span style="font-weight: bold;">Résultats</span>
            </th>
          </tr>
          <tr style="border-bottom: 2px solid rgba(0,0,0,0.24);">
            <th
              v-for="(header, i) in headers"
              :key="header.text"
              :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy, asc: !pagination.descending, desc: !pagination.descending}"
              nowrap
              :style="i === inputFields.length - 1 ? 'border-right: 2px solid rgba(0,0,0,0.24);' : ''"
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
        </template>
        <template v-slot:item="{item}">
          <tr :style="!!item[errorField.key] ? 'background-color: #FFCDD2' : ''">
            <td
              v-for="(header, i) in headers"
              :key="header.value"
              :style="i === inputFields.length - 1 ? 'border-right: 2px solid rgba(0,0,0,0.24);' : ''"
            >
              {{ ((item[header.value] === undefined || item[header.value] === null ? '' : item[header.value]) + '') | truncate(50) }}
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>

<script>
  import eventBus from '~/event-bus'
  const { mapState, mapGetters } = require('vuex')

  export default {
    props: ['remoteService', 'action'],
    data: () => ({
      data: {},
      query: null,
      pagination: {
        page: 1,
        itemsPerPage: 5,
        sortBy: '',
        descending: false,
      },
      loading: false,
      errorMode: 'all',
      nbErrors: null,
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl', 'remoteServicesMap']),
      errorModes() {
        return [
          { value: 'all', text: 'Voir toutes les lignes' },
          { value: 'only', text: `Voir uniquement les ${this.nbErrors} lignes en erreur` },
          { value: 'hide', text: `Voir uniquement les ${this.nbTotal - this.nbErrors} lignes sans erreur` }]
      },
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
        return this.dataset.schema
          .filter(f => f['x-extension'] !== `${this.remoteService}/${this.action}`)
          .filter(f => f['x-refersTo'] && this.actionObj.input.find(i => i.concept === f['x-refersTo']))
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
            sortable: field.type === 'string' || field.type === 'number' || field.type === 'integer',
            value: field.key,
          }))
      },
      plural() {
        return this.data.total > 1
      },
    },
    watch: {
      selectFields: {
        handler() {
          if (this.selectFields) {
            this.init()
            this.refresh()
          }
        },
        immediate: true,
      },
      pagination: {
        handler () {
          this.refresh()
        },
        deep: true,
      },
      errorMode() {
        this.refresh()
      },
    },
    methods: {
      orderBy(header) {
        if (!header.sortable) return
        if (this.pagination.sortBy === header.value) {
          this.pagination.descending = !this.pagination.descending
        } else {
          this.pagination.sortBy = header.value
          this.pagination.descending = true
        }
      },
      async refresh() {
        if (!this.errorField) return
        const params = {
          size: this.pagination.itemsPerPage,
          page: this.pagination.page,
        }
        if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
        if (this.query) params.q = this.query
        if (this.errorMode === 'only') params.qs = `_exists_:${this.errorField.key}`
        if (this.errorMode === 'hide') params.qs = `!(_exists_:${this.errorField.key})`
        params.select = this.selectFields.map(f => f.key).join(',')
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
      async init() {
        try {
          this.nbTotal = (await this.$axios.$get(this.resourceUrl + '/lines', { params: { size: 0 } })).total
          this.nbErrors = (await this.$axios.$get(this.resourceUrl + '/lines', { params: { size: 0, qs: `_exists_:${this.errorField.key}` } })).total
        } catch (error) {
          if (error.response && error.response.status === 404) this.notFound = true
          else eventBus.$emit('notification', { error, msg: 'Erreur pendant le comptage des erreurs' })
        }
      },
    },
  }
</script>

<style lang="css">
</style>
