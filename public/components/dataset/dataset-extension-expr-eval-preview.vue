<template lang="html">
  <v-row>
    <v-col>
      <tutorial-alert
        id="expr-eval"
        :html="$t('exprEvalHelp')"
        persistent
        :initial="true"
      />
      <v-text-field
        v-model="extension.expr"
        class="mt-2"
        :label="$t('expr')"
        outlined
        dense
        :error-messages="parsingError"
      />
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
        <template #item="{item, index}">
          <tr>
            <template v-for="(header, i) in headers">
              <td
                v-if="i === 0 && extensionResults[index] && 'result' in extensionResults[index]"
                :key="header.value"
                style="border-right: 2px solid rgba(0,0,0,0.24);font-weight: bold;"
                class="primary--text"
              >
                {{ extensionResults[index].result }}
              </td>
              <td
                v-else-if="i === 0 && extensionResults[index] && 'error' in extensionResults[index]"
                :key="header.value"
                style="border-right: 2px solid rgba(0,0,0,0.24);font-weight: bold;"
                class="error--text"
              >
                {{ extensionResults[index].error }}
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
  expr: Expression
  emptyExpr: Saisissez une expression
  exprEvalHelp: "Une expression (ou formule) est utilisée pour calculer le contenu d'une colonne en fonction des valeurs des autres colonnes.
  Elle doit suivre la syntaxe du module <a href=\"https://github.com/silentmatt/expr-eval\">expr-eval</a>.
  Les valeurs des autres colonnes sont passées en paramètre avec leurs clés comme nom du paramètre. <br><br>
  Quelques fonctions sont disponibles rappelant des fonctionnalités habituelles de tableurs :
  <ul>
    <li><code>CONCATENATE ou CONCAT(param1, param2, ...)</code><br>retourne une chaîne de caractère résultat de la concaténation de tous les paramètres. Les paramètres qui ne sont pas des chaînes de caractères seront ignorés.</li>
    <li><code>TRIM(param)</code><br>enlève les caractères blancs au début et à la fin de la chaine de caractère en paramètre et remplace toutes les séries de caractères blancs dans le contenu par un simple espace.</li>
    <li><code>UPPER(param)</code><br>passe une chaîne de caractère en majuscule.</li>
    <li><code>LOWER(param)</code><br>passe une chaîne de caractère en minuscule.</li>
    <li><code>SUBSTRING(param, debut, longueur)</code><br>extrait une sous chaîne de caractère en spécifiant la position de début (commence à 0) et la longueur (la longueur est un paramètre optionnel).</li>
    <li><code>EXTRACT(param, avant, après)</code><br>extrait une sous chaîne de caractère en spécifiant un chaîne à trouver avant et une autre après. Si un séparateur avant ou après est vide il est ignoré. Si un séparateur avant ou après n'est pas trouvé le résultat est vide.</li>
    <li><code>REPLACE(param, recherche, remplacement)</code><br>remplace toutes les occurences d'un sous chaîne de caractère par une autre.</li>
    <li><code>SUM(param1, param2, ...)</code><br>effectue la somme de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.</li>
    <li><code>AVERAGE ou AVG(param1, param2, ...)</code><br>calcule la moyenne de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.</li>
  </ul>"
en:
  linesCount: " | See 1 extension result | See {count} extension results"
  firstLines: See the {lines} first results of the extension
  lines: lines
  errorFetch: Error while fetching data
  errorParse: Error while analyzing the expression
  params: Parameters
  results: Results
  expr: Expression
  emptyExpr: Write an expression
</i18n>

<script>
import eventBus from '~/event-bus'
import { unflatten } from 'flat'
const { parser } = require('../../../shared/expr-eval')
const { getExtensionKey } = require('../../../shared/utils/extensions')
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
    },
    extensionResults () {
      return this.data.results.map(result => {
        if (!this.parsedExpression) return null
        try {
          const data = unflatten(result)
          // WARNING: this code is duplicated in server/utils/extensions.js
          for (const prop of this.dataset.schema) {
            const ext = this.dataset.extensions?.find(e => prop.key.startsWith(getExtensionKey(e) + '.'))
            if (ext) {
              const extKey = getExtensionKey(ext)
              data[extKey] = data[extKey] ? { ...data[extKey] } : {}
              const shortKey = prop.key.replace(extKey + '.', '')
              data[extKey][shortKey] = data[extKey][shortKey] ?? null
            } else {
              data[prop.key] = data[prop.key] ?? null
            }
          }

          return { result: this.parsedExpression.evaluate(data) }
        } catch (err) {
          return { error: err.message }
        }
      })
    }
  },
  watch: {
    'extension.expr': {
      handler () {
        if (!this.extension.expr.trim()) {
          this.parsingError = this.$t('emptyExpr')
        } else {
          try {
            this.parsedExpression = parser.parse(this.extension.expr)
            this.parsingError = null
          } catch (err) {
            this.parsingError = err.message
            return null
          }
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
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
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
