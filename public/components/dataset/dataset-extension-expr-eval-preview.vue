<template lang="html">
  <v-row>
    <v-alert
      v-if="parsingError"
      type="error"
      :value="true"
    >
      {{ $t('errorParse') }} : {{ parsingError }}
    </v-alert>
    <v-col v-else>
      <h3
        v-if="data.total <= 10000"
        v-text="$tc('linesCount', data.total)"
      />
      <h3
        v-else
        v-t="{path: 'firstLines', args: {lines: 10000, total: data.total}}"
      />
      <v-row class="mr-0">
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
            dense
            outlined
            @keyup.enter.native="refresh"
            @click:append="refresh"
          />
        </v-col>
        <v-spacer />
        <v-select
          v-show="$vuetify.breakpoint.mdAndUp"
          v-model="pagination.itemsPerPage"
          :items="[{value: 5}, {value: 10},{value: 20},{value:50}]"
          :item-text="item => (item.value + ' ' + $t('lines'))"
          hide-details
          dense
          style="max-width: 120px;"
        />
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
        <template #header>
          <tr style="height: 30px;border-bottom: 2px solid rgba(0,0,0,0.24);">
            <th
              :colspan="1"
              class="column text-left pl-4"
              style="border-right: 2px solid rgba(0,0,0,0.24);padding-right: 8px;"
            >
              <span style="font-weight: bold;">{{ $t('results') }}</span>
            </th>
            <th
              :colspan="inputFields.length"
              class="column text-left pl-4"
            >
              <span style="font-weight: bold;">{{ $t('params') }}</span>
            </th>
          </tr>
          <tr style="border-bottom: 2px solid rgba(0,0,0,0.24);">
            <th
              v-for="(header, i) in headers"
              :key="header.text"
              :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy, asc: !pagination.descending, desc: !pagination.descending}"
              nowrap
              :style="i === 0 ? 'border-right: 2px solid rgba(0,0,0,0.24);padding-right: 8px;' : ''"
              class="text-left pl-4"
              @click="orderBy(header)"
            >
              <v-tooltip
                v-if="header.tooltip"
                bottom
                style="margin-right: 8px;"
              >
                <template #activator="{ on }">
                  <v-icon
                    small
                    v-on="on"
                  >
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
        <template #item="{item}">
          <tr>
            <template v-for="(header, i) in headers">
              <td
                v-if="i === 0 && item[header.value].result"
                :key="header.value"
                style="border-right: 2px solid rgba(0,0,0,0.24);font-weight: bold;"
                class="primary--text"
              >
                {{ item[header.value].result }}
              </td>
              <td
                v-else-if="i === 0 && item[header.value].error"
                :key="header.value"
                style="border-right: 2px solid rgba(0,0,0,0.24);font-weight: bold;"
                class="error--text"
              >
                {{ item[header.value].error }}
              </td>
              <td
                v-else
                :key="header.value"
              >
                {{ ((item[header.value] === undefined || item[header.value] === null ? '' : item[header.value]) + '') | truncate(50) }}
              </td>
            </template>
          </tr>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  linesCount: " | Consultez 1 résultat d'extension | Consultez {count} résultats d'extensions"
  firstLines: Consultez les {lines} premiers résultats d'extension
  lines: lignes
  errorFetch: Erreur pendant la récupération des données
  errorParse: Erreur pendant l'analyse de l'expression
  params: Paramètres
  results: Résultats
en:
  linesCount: " | See 1 extension result | See {count} extension results"
  firstLines: See the {lines} first results of the extension
  lines: lines
  errorFetch: Error while fetching data
  errorParse: Error while analyzing the expression
  params: Parameters
  results: Results
</i18n>

<script>
import eventBus from '~/event-bus'
const { parser } = require('../../../shared/expr-eval')
const { mapState, mapGetters } = require('vuex')

export default {
  props: ['extension'],
  data: () => ({
    data: {},
    query: null,
    pagination: {
      page: 1,
      itemsPerPage: 5,
      sortBy: '',
      descending: false
    },
    loading: false,
    parsingError: null,
    parsedExpression: null
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    inputFields () {
      return this.dataset.schema
        .filter(f => f['x-extension'] !== this.extension.property?.key)
    },
    outputField () {
      return this.extension.property
    },
    headers () {
      return [{ text: '', sortable: false, value: this.outputField.key }].concat(this.inputFields.map(field => ({
        text: field.key,
        sortable: field.type === 'string' || field.type === 'number' || field.type === 'integer',
        value: field.key
      })))
    },
    plural () {
      return this.data.total > 1
    }
  },
  watch: {
    'extension.expr': {
      handler () {
        try {
          this.parsedExpression = parser.parse(this.extension.expr)
        } catch (err) {
          this.parsingError = err.message
          return null
        }
      },
      immediate: true
    },
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    }
  },
  mounted () {
    this.refresh()
  },
  methods: {
    orderBy (header) {
      if (!header.sortable) return
      if (this.pagination.sortBy === header.value) {
        this.pagination.descending = !this.pagination.descending
      } else {
        this.pagination.sortBy = header.value
        this.pagination.descending = true
      }
    },
    async refresh () {
      const params = {
        size: this.pagination.itemsPerPage,
        page: this.pagination.page
      }
      if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
      if (this.query) params.q = this.query
      this.loading = true
      try {
        const data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
        for (const result of data.results) {
          try {
            const data = { ...result }
            for (const prop of this.dataset.schema) {
              data[prop.key] = data[prop.key] ?? null
            }
            result[this.extension.property.key] = { result: this.parsedExpression.evaluate(data) }
          } catch (err) {
            result[this.extension.property.key] = { error: err.message }
          }
        }
        this.data = data
        this.notFound = false
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: this.$t('errorFetch') })
      }
      this.loading = false
    }
  }
}
</script>

<style lang="css">
</style>
