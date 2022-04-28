<template>
  <v-data-table
    :headers="headers"
    :items="history ? history.results : []"
    :server-items-length="history && history.total"
    :loading="loading"
    :options.sync="pagination"
    :footer-props="{'items-per-page-text': $t('nbRevisions')}"
  >
    <template #item="{item}">
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
              v-else-if="item._action === 'create'"
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
</template>

<i18n lang="yaml">
fr:
  nbRevisions: Nombre de révisions
  updatedAt: Date
  id: Identifiant de ligne
  created: Création
  deleted: Suppression
  edited: Édition
en:
  nbRevisions: Number of revisions
  updatedAt: Date
  id: Line identifier
  create: Created
  delete: Deleted
  edit: Edited
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
        page: 1,
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
  watch: {
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    }
  },
  methods: {
    async refresh () {
      this.loading = true
      const revisionsUrl = this.line ? `${this.resourceUrl}/lines/${this.line._id}/revisions` : `${this.resourceUrl}/revisions`
      this.history = await this.$axios.$get(revisionsUrl, {
        params: {
          page: this.pagination.page,
          size: this.pagination.itemsPerPage
        }
      })
      this.loading = false
    }
  }
}
</script>

<style>

</style>
