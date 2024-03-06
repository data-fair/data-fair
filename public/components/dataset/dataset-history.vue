<template>
  <div>
    <v-row class="mr-0">
      <v-spacer />
      <v-select
        v-if="history && $vuetify.breakpoint.mdAndUp"
        v-model="pagination.itemsPerPage"
        :items="[{value: 10},{value: 20},{value:50}]"
        :item-text="item => (item.value + ' ' + $t('lines'))"
        hide-details
        dense
        style="max-width: 120px;"
        class="mr-2"
        @change="history=null;fetch()"
      />
      <v-btn
        fab
        x-small
        color="primary"
        class="mt-2 mr-1"
        @click="history=null;fetch()"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-row>
    <v-data-table
      :headers="headers"
      :items="history ? history.results : []"
      :server-items-length="history && history.total"
      :loading="loading"
      hide-default-footer
    >
      <template #item="{item, index}">
        <tr>
          <td
            v-for="header in headers"
            :key="header.value"
            class="pr-0 pl-4"
          >
            <template v-if="header.value === '_action'">
              <v-icon
                v-if="item._action === 'delete'"
                color="warning"
                :title="$t('deleted')"
              >
                mdi-delete-circle
              </v-icon>
              <v-icon
                v-else-if="item._action === 'create' || (item._action === 'createOrUpdate' && index === history.results.length - 1)"
                color="success"
                :title="$t('created')"
              >
                mdi-plus-circle
              </v-icon>
              <v-icon
                v-else
                :title="$t('edited')"
              >
                mdi-pencil-circle
              </v-icon>
            </template>
            <template v-else-if="header.value === '_updatedAt'">
              {{ new Date(item._updatedAt).toLocaleString() }}
            </template>
            <template v-else-if="header.value === '_id'">
              {{ item._id }}
            </template>
            <template v-else>
              <div :style="`position: relative; max-height: 40px; min-width: ${Math.min((item[header.value] + '').length, 50) * 6}px;`">
                <span>{{ item[header.value] | cellValues(header.field) }}</span>
              </div>
            </template>
          </td>
        </tr>
      </template>
    </v-data-table>
    <v-row
      v-if="history && history.next"
      justify="center"
      class="ma-0"
    >
      <v-btn
        text
        color="primary"
        :loading="loading"
        @click="fetch"
      >
        {{ $t('fetchMore') }}
      </v-btn>
    </v-row>
  </div>
</template>

<i18n lang="yaml">
fr:
  nbRevisions: Nombre de révisions
  updatedAt: Date
  id: Identifiant de ligne
  created: Création
  deleted: Suppression
  edited: Édition
  fetchMore: Voir plus
en:
  nbRevisions: Number of revisions
  updatedAt: Date
  id: Line identifier
  create: Created
  delete: Deleted
  edit: Edited
  fetchMore: See more
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  props: ['line'],
  data () {
    return {
      history: null,
      loading: false,
      pagination: {
        itemsPerPage: 10
      }
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    headers () {
      const headers = this.dataset.schema
        .filter(field => !field['x-calculated'])
        .map(field => ({
          text: field.title || field['x-originalName'] || field.key,
          value: field.key,
          sortable: false,
          tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description),
          field
        }))
      if (!(this.dataset.primaryKey && this.dataset.primaryKey.length) && !this.line) {
        headers.unshift({ text: this.$t('id'), value: '_id', sortable: false })
      }
      headers.unshift({ text: this.$t('updatedAt'), value: '_updatedAt', sortable: false })
      headers.unshift({ text: '', value: '_action', sortable: false })
      return headers
    }
  },
  mounted () {
    this.fetch()
  },
  methods: {
    async fetch () {
      this.loading = true
      const revisionsUrl = this.line ? `${this.resourceUrl}/lines/${this.line._id}/revisions` : `${this.resourceUrl}/revisions`
      if (!this.history) {
        this.history = await this.$axios.$get(revisionsUrl, { params: { size: this.pagination.itemsPerPage } })
      } else if (this.history.next) {
        const history = await this.$axios.$get(this.history.next)
        this.history.next = history.next
        this.history.results = this.history.results.concat(history.results)
      }
      this.loading = false
    }
  }
}
</script>

<style>

</style>
