<template lang="html">
  <v-row class="dataset-virtual">
    <v-col>
      <h2
        v-t="'children'"
        class="text-h6"
      />

      <!-- add a dataset -->
      <v-autocomplete
        :items="datasets || []"
        :loading="loadingDatasets"
        :search-input.sync="searchDataset"
        :filter="() => true"
        style="max-width: 400px;"
        hide-no-data
        item-text="title"
        item-value="id"
        :label="$t('addChild')"
        :placeholder="$t('search')"
        outlined
        dense
        class="my-2"
        hide-details="auto"
        @change="addChild"
      />

      <v-progress-linear
        v-if="loadingChildren"
        :indeterminate="true"
        color="primary"
        height="2"
        style="margin:0;"
      />
      <div
        v-else
        style="max-height: 2px;"
      />
      <template v-if="childrenById">
        <!-- list of datasets -->
        <p
          v-if="dataset.virtual.children.length === 0"
          v-t="'noChild'"
          class="caption mt-3"
        />

        <v-card
          v-else
          outlined
          style="max-height: 400px; overflow-y: auto;"
        >
          <v-list flat>
            <v-list-item
              v-for="(child,index) in dataset.virtual.children"
              :key="child"
            >
              <v-list-item-content
                v-if="childrenById[child]"
                class="py-1"
              >
                <v-list-item-title>
                  <nuxt-link :to="`/dataset/${child}`">
                    {{ childrenById[child].title }} ({{ childrenById[child].id }})
                  </nuxt-link>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <v-autocomplete
                    :value="null"
                    :items="childrenById[child].schema.filter(f => !f['x-calculated'] && !existingFields.includes(f.key))"
                    :item-text="(field) => field.title || field['x-originalName'] || field.key"
                    :search-input.sync="searchCol[child]"
                    hide-no-data
                    item-value="id"
                    :label="$t('addColumn')"
                    return-object
                    style="max-width: 400px;"
                    hide-details
                    dense
                    solo
                    flat
                    @change="field => addField(field, child)"
                  />
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action>
                <v-icon
                  color="warning"
                  title="Supprimer"
                  @click="currentChild = index; deleteChildDialog = true"
                >
                  mdi-delete
                </v-icon>
              </v-list-item-action>
            </v-list-item>
          </v-list>
        </v-card>

        <!-- list of selected columns -->
        <h2
          v-t="'selectedColumns'"
          class="text-h6 mt-4"
        />

        <p
          v-if="dataset.schema.filter(f => !f['x-calculated']).length === 0"
          v-t="'noColumn'"
          class="caption mt-3"
        />
        <v-card
          v-else
          outlined
          style="max-height: 400px; overflow-y: auto;"
        >
          <v-list flat>
            <draggable
              v-model="dataset.schema"
              :options="{handle: '.handle'}"
              @end="saveSchema"
            >
              <v-list-item
                v-for="field in dataset.schema"
                v-show="!field['x-calculated']"
                :key="field.key"
              >
                <v-list-item-avatar>
                  <v-icon
                    :title="$t('reorder')"
                    class="handle"
                  >
                    mdi-sort
                  </v-icon>
                </v-list-item-avatar>
                <v-list-item-content class="py-1">
                  <v-list-item-title>{{ field.title || field['x-originalName'] || field.key }} ({{ field.key }})</v-list-item-title>
                </v-list-item-content>
                <v-list-item-action>
                  <v-icon
                    color="warning"
                    title="Supprimer"
                    @click="deleteField(field)"
                  >
                    mdi-delete
                  </v-icon>
                </v-list-item-action>
              </v-list-item>
            </draggable>
          </v-list>
        </v-card>

        <!-- list of filters -->
        <h2
          v-t="'filters'"
          class="text-h6 mt-4"
        />

        <v-autocomplete
          :items="allColumns.filter(c => !filtersByKey[c.key])"
          :item-text="(field) => field.title || field['x-originalName'] || field.key"
          :search-input.sync="searchFilter"
          hide-no-data
          item-value="id"
          :label="$t('addFilter')"
          return-object
          style="max-width: 400px;"
          dense
          outlined
          class="my-2"
          hide-details="auto"
          @change="addFilter"
        />

        <p
          v-if="!dataset.virtual.filters.length"
          v-t="'noFilter'"
          class="caption mt-3"
        />
        <v-list
          v-else
          outlined
          class="py-0"
        >
          <v-list-item
            v-for="filter in dataset.virtual.filters"
            :key="filter.key"
          >
            <v-list-item-content>
              <v-list-item-title>{{ filterLabel(filter) }}</v-list-item-title>
              <v-list-item-subtitle>
                <v-combobox
                  v-model="filter.values"
                  :items="valuesByKey[filter.key]"
                  :label="$t('restrictValues')"
                  outlined
                  chips
                  clearable
                  multiple
                  small-chips
                  hide-details
                  dense
                  class="mt-1"
                  @change="saveFilters"
                >
                  <template #selection="data">
                    <v-chip
                      close
                      small
                      @click:close="filter.values = filter.values.filter(v => v !== data.item); saveFilters()"
                    >
                      {{ data.item }}
                    </v-chip>
                  </template>
                </v-combobox>
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action>
              <v-icon
                color="warning"
                title="Supprimer"
                @click="dataset.virtual.filters = dataset.virtual.filters.filter(f => f.key !== filter.key); saveFilters()"
              >
                mdi-delete
              </v-icon>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </template>

      <v-dialog
        v-model="deleteChildDialog"
        max-width="500px"
      >
        <v-card
          v-if="childrenById && childrenById[dataset.virtual.children[currentChild]]"
          outlined
        >
          <v-card-title
            v-t="'deleteTitle'"
            primary-title
          />
          <v-card-text>
            <v-alert
              v-t="'deleteWarning'"
              :value="true"
              type="error"
              outlined
            />
          </v-card-text>
          <v-card-text v-t="{path: 'deleteConfirm', args: {name: childrenById[dataset.virtual.children[currentChild]].title }}" />
          <v-card-actions>
            <v-spacer />
            <v-btn
              v-t="'no'"
              text
              @click="deleteChildDialog = false"
            />
            <v-btn
              v-t="'yes'"
              color="warning"
              @click="deleteChild(currentChild); deleteChildDialog = false"
            />
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  children: Jeux de données agrégés
  addChild: Ajouter un jeu de données
  noChild: Aucun jeu de données agrégé.
  selectedColumns: Colonnes sélectionnées
  noColumn: Aucune colonne sélectionnée.
  addColumn: ajouter une colonne
  reorder: Réordonner
  restrictValues: Restreindre à des valeurs
  deleteTitle: Suppression du jeu de données enfant
  deleteWarning: Attention ! Supprimer ce jeu de données de la liste peut modifier le schéma du jeu de données virtuel et les applications qui l'utilisent.
  deleteConfirm: Voulez vous vraiment supprimer le jeu de données "{name}" de la liste ?
  yes: Oui
  no: Non
  filters: Filtres
  addFilter: ajouter un filtre
  noFilter: Aucun filtre défini.
en:
  search: Search
  children: Aggregated datasets
  addChild: Add a dataset
  noChild: No dataset aggregated.
  selectedColumns: Selected columns
  noColumn: No column inherited.
  addColumn: add a column
  reorder: Reorder
  restrictValues: Restrict to some values
  deleteTitle: Delete child dataset
  deleteWarning: Warning ! Delete this dataset from the list can alter the schema of the virtual dataset and the applications that use it.
  deleteConfirm: Do you really want to delete the dataset {name} from the list ?
  yes: Yes
  no: No
  filters: Filters
  addFilter: add a filter
  noFilter: No filter defined.
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
const Draggable = require('vuedraggable')

export default {
  components: { Draggable },
  data () {
    return {
      datasets: null,
      loadingDatasets: false,
      searchDataset: '',
      searchedDataset: null,
      searchCol: {},
      searchFilter: '',
      childrenById: null,
      schemasById: {},
      deleteChildDialog: false,
      currentChild: null,
      loadingChildren: false
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can']),
    existingFields () {
      return this.dataset.schema.map(f => f.key)
    },
    filtersByKey () {
      return this.dataset.virtual.filters.reduce((a, f) => {
        a[f.key] = f
        return a
      }, {})
    },
    allColumns () {
      let cols = []
      for (const id in this.childrenById) {
        cols = cols.concat(this.childrenById[id].schema
          .filter(c => !c['x-calculated'] && !cols.find(c2 => c.key === c2.key)))
      }
      return cols
    },
    valuesByKey () {
      const valuesByKey = {}
      for (const id in this.childrenById) {
        for (const col of this.childrenById[id].schema) {
          if (col.enum) {
            valuesByKey[col.key] = valuesByKey[col.key] || []
            for (const val of col.enum) {
              if (!valuesByKey[col.key].includes(val)) valuesByKey[col.key].push(val)
            }
          }
        }
      }
      return valuesByKey
    }
  },
  watch: {
    searchDataset: {
      immediate: true,
      handler () {
        this.searchDatasets()
      }
    }
  },
  mounted () {
    this.fetchChildren()
    this.dataset.virtual.filters = this.dataset.virtual.filters || []
    this.dataset.virtual.filters = this.dataset.virtual.filters.filter(f => f.values && f.values.length)
  },
  methods: {
    ...mapActions('dataset', ['patchAndCommit', 'fetchInfo']),
    async fetchChildren () {
      this.loadingChildren = true
      const res = await this.$axios.$get('api/v1/datasets', {
        params: { size: 1000, select: 'id,title,schema', id: this.dataset.virtual.children.join(',') }
      })
      // remove children that do not exist anymore
      this.dataset.virtual.children = this.dataset.virtual.children.filter(child => res.results.find(d => d.id === child))
      this.childrenById = res.results.reduce((a, d) => { a[d.id] = d; return a }, {})
      for (const child of this.dataset.virtual.children) {
        this.$set(this.searchCol, child, '')
      }
      this.loadingChildren = false
    },
    async searchDatasets () {
      this.loadingDatasets = true
      const res = await this.$axios.$get('api/v1/datasets', {
        params: { q: this.searchDataset, size: 20, select: 'id,title', status: 'finalized', owner: `${this.dataset.owner.type}:${this.dataset.owner.id}` }
      })
      this.datasets = res.results
        .filter(d => d.id !== this.dataset.id && !this.dataset.virtual.children.includes(d.id))
      this.loadingDatasets = false
    },
    async addChild (child) {
      await this.$nextTick()
      this.searchDataset = ''
      await this.patchAndCommit({ virtual: { ...this.dataset.virtual, children: this.dataset.virtual.children.concat([child]) } })
      this.fetchChildren()
    },
    async deleteChild (i) {
      this.dataset.virtual.children.splice(i, 1)
      await this.patchAndCommit({ virtual: { ...this.dataset.virtual } })
      this.fetchInfo()
    },
    async saveSchema () {
      await this.patchAndCommit({ schema: this.dataset.schema })
    },
    async saveFilters () {
      await this.patchAndCommit({ virtual: { ...this.dataset.virtual, filters: this.dataset.virtual.filters } })
    },
    async addField (field, child) {
      const prop = { key: field.key, title: field.title, type: field.type, format: field.format }
      await this.patchAndCommit({ schema: this.dataset.schema.concat(prop) })
      this.$set(this.searchCol, child, '')
    },
    async deleteField (field) {
      await this.patchAndCommit({ schema: this.dataset.schema.filter(f => f.key !== field.key) })
    },
    filterLabel (filter) {
      const col = this.allColumns.find(c => c.key === filter.key)
      return (col && (col.title || col['x-originalName'] || col.key)) || filter.key
    },
    async addFilter (col) {
      this.dataset.virtual.filters.push({ key: col.key, values: [] })
      await this.$nextTick()
      this.searchFilter = ''
    }
  }
}
</script>

<style lang="css">
.handle {
  cursor: grab;
}

.dataset-virtual tbody tr:hover {
  background-color: transparent !important;
}
</style>
