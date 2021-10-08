<template lang="html">
  <v-row class="dataset-virtual">
    <v-col>
      <h2 v-t="'children'" class="text-h6" />

      <v-autocomplete
        :items="datasets || []"
        :loading="loadingDatasets"
        :search-input.sync="search"
        :filter="() => true"
        style="max-width: 400px;"
        hide-no-data
        item-text="title"
        item-value="id"
        :label="$t('addChild')"
        :placeholder="$t('search')"
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

      <v-card outlined>
        <v-data-table
          :items="dataset.virtual.children"
          hide-default-header
          hide-default-footer
          :items-per-page="1000"
          height="300"
        >
          <template slot="no-data" v-t="'noChild'" />
          <template v-slot:item="{item, index}">
            <tr v-if="childrenById[item]">
              <td class="py-2">
                <div class="subheading">
                  <nuxt-link :to="`/dataset/${item}`">
                    {{ childrenById[item].title }} ({{ childrenById[item].id }})
                  </nuxt-link>
                </div>
                <v-select
                  :value="null"
                  :items="childrenById[item].schema.filter(f => !f['x-calculated'] && !existingFields.includes(f.key))"
                  :item-text="(field) => field.title || field['x-originalName'] || field.key"
                  hide-no-data
                  item-value="id"
                  label="Ajouter une colonne"
                  return-object
                  style="max-width: 400px;"
                  hide-details
                  dense
                  solo
                  flat
                  @change="addField"
                />
              </td>
              <td class="text-right">
                <v-icon
                  color="warning"
                  title="Supprimer"
                  @click="currentChild = index; deleteChildDialog = true"
                >
                  mdi-delete
                </v-icon>
              </td>
            </tr>
          </template>
        </v-data-table>
      </v-card>

      <h2 v-t="'selectedColumns'" class="text-h6 mt-4" />

      <p v-if="dataset.schema.filter(f => !f['x-calculated']).length === 0" v-t="'noColumn'" />
      <v-list
        v-else
        three-line
        outlined
        class="py-0"
      >
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
              <v-combobox
                v-if="filtersByKey[field.key]"
                v-model="filtersByKey[field.key].values"
                :items="valuesByKey[field.key]"
                :label="$t('restrictValues')"
                outlined
                chips
                clearable
                multiple
                small-chips
                hide-details
                dense
                @change="saveFilters"
              >
                <template v-slot:selection="data">
                  <v-chip
                    close
                    small
                    @click:close="filtersByKey[field.key].values = filtersByKey[field.key].values.filter(v => v !== data.item); saveFilters()"
                  >
                    {{ data.item }}
                  </v-chip>
                </template>
              </v-combobox>
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

      <v-dialog
        v-model="deleteChildDialog"
        max-width="500px"
      >
        <v-card v-if="childrenById[dataset.virtual.children[currentChild]]" outlined>
          <v-card-title v-t="'deleteTitle'" primary-title />
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
  noChild: Aucun jeu de données agrégé pour l'instant.
  selectedColumns: Colonnes sélectionnées
  noColumn: Aucune colonne héritée pour l'instant.
  reorder: Réordonner
  restrictValues: Restreindre à des valeurs
  deleteTitle: Suppression du jeu de données enfant
  deleteWarning: Attention ! Supprimer ce jeu de données de la liste peut modifier le schéma du jeu de données virtuel et les applications qui l'utilisent.
  deleteConfirm: Voulez vous vraiment supprimer le jeu de données "{name}" de la liste ?
  yes: Oui
  no: Non
en:
  search: Search
  children: Aggregated datasets
  addChild: Add a dataset
  noChild: No dataset aggregated for now.
  selectedColumns: Selected columns
  noColumn: No column inherited for now.
  reorder: Reorder
  restrictValues: Restrict to some values
  deleteTitle: Delete child dataset
  deleteWarning: Warning ! Delete this dataset from the list can alter the schema of the virtual dataset and the applications that use it.
  deleteConfirm: Do you really want to delete the dataset {name} from the list ?
  yes: Yes
  no: No
</i18n>

<script>
  import { mapState, mapGetters, mapActions } from 'vuex'
  const Draggable = require('vuedraggable')

  export default {
    components: { Draggable },
    data() {
      return {
        datasets: null,
        loadingDatasets: false,
        search: '',
        childrenById: {},
        schemasById: {},
        deleteChildDialog: false,
        currentChild: null,
        valuesByKey: {},
        loadingChildren: false,
      }
    },
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['can']),
      existingFields() {
        return this.dataset.schema.map(f => f.key)
      },
      filtersByKey() {
        return this.dataset.virtual.filters.reduce((a, f) => {
          a[f.key] = f
          return a
        }, {})
      },
    },
    watch: {
      search: {
        immediate: true,
        handler() {
          this.searchDatasets()
        },
      },
      'dataset.schema': {
        immediate: true,
        handler() {
          if (!this.dataset || !this.dataset.virtual) return
          this.dataset.virtual.filters = this.dataset.virtual.filters || []
          this.dataset.schema.forEach(field => {
            if (!this.dataset.virtual.filters.find(filter => filter.key === field.key)) {
              this.dataset.virtual.filters.push({ key: field.key, values: [] })
            }
          })
          this.dataset.virtual.filters = this.dataset.virtual.filters.filter(f => {
            return this.dataset.schema.find(field => field.key === f.key)
          })
        },
      },
    },
    mounted() {
      this.fetchChildren()
    },
    methods: {
      ...mapActions('dataset', ['patchAndCommit', 'fetchInfo']),
      async fetchChildren() {
        this.loadingChildren = true
        const res = await this.$axios.$get('api/v1/datasets', {
          params: { size: 1000, select: 'id,title,schema', id: this.dataset.virtual.children.join(',') },
        })
        // remove children that do not exist anymore
        this.dataset.virtual.children = this.dataset.virtual.children.filter(child => res.results.find(d => d.id === child))
        this.childrenById = res.results.reduce((a, d) => { a[d.id] = d; return a }, {})
        this.loadingChildren = false
      },
      async searchDatasets() {
        this.loadingDatasets = true
        const res = await this.$axios.$get('api/v1/datasets', {
          params: { q: this.search, size: 20, select: 'id,title', status: 'finalized', owner: `${this.dataset.owner.type}:${this.dataset.owner.id}` },
        })
        this.datasets = res.results
          .filter(d => d.id !== this.dataset.id && !this.dataset.virtual.children.includes(d.id))
        this.loadingDatasets = false
      },
      async addChild(child) {
        await this.patchAndCommit({ virtual: { ...this.dataset.virtual, children: this.dataset.virtual.children.concat([child]) } })
        this.fetchChildren()
      },
      async deleteChild(i) {
        this.dataset.virtual.children.splice(i, 1)
        await this.patchAndCommit({ virtual: { ...this.dataset.virtual } })
        this.fetchInfo()
      },
      async saveSchema() {
        await this.patchAndCommit({ schema: this.dataset.schema })
      },
      async saveFilters() {
        await this.patchAndCommit({ virtual: { ...this.dataset.virtual, filters: this.dataset.virtual.filters } })
      },
      async addField(field) {
        const prop = { key: field.key, title: field.title, type: field.type, format: field.format }
        await this.patchAndCommit({ schema: this.dataset.schema.concat(prop) })
      },
      async deleteField(field) {
        await this.patchAndCommit({ schema: this.dataset.schema.filter(f => f.key !== field.key) })
      },
    },
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
