<template>
  <div>
    <h3
      v-if="datasets"
      class="display-1"
    >
      {{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données
    </h3>

    <search-filters
      :filter-labels="{children: 'Jeu de données agrégé'}"
      :filters="filters"
      :facets="datasets && datasets.facets"
      type="datasets"
      @apply="page = 1; refresh()"
    />
    <search-progress :loading="loading" />

    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="8"
        lg="10"
        xl="10"
      >
        <v-row v-if="datasets" class="resourcesList">
          <v-col
            v-for="dataset in datasets.results"
            :key="dataset.id"
            sm="12"
            md="6"
            lg="4"
            xl="3"
          >
            <v-card height="100%" :to="`/dataset/${dataset.id}/description`">
              <v-card-title>
                {{ dataset.title || dataset.id }}
              </v-card-title>
              <v-card-text
                style="min-height:80px"
                v-html="marked($options.filters.truncate(dataset.description || '', 200))"
              />
              <v-card-actions style="width:100%">
                <span v-if="dataset.owner.type === 'user'"><v-icon>mdi-account</v-icon>&nbsp;{{ dataset.owner.name }}</span>
                <span v-if="dataset.owner.type === 'organization'"><v-icon>mdi-account-group</v-icon>&nbsp;{{ dataset.owner.name }}<span v-if="dataset.owner.role"> ({{ dataset.owner.role }})</span></span>
                &nbsp;<v-chip
                  :color="dataset.visibility === 'public' ? 'primary' : 'accent'"
                  text-color="white"
                >
                  {{ {public: 'Public', private: 'Privé', protected: 'Protégé'}[dataset.visibility] }}
                </v-chip>
                <template v-if="dataset.status === 'error'">
                  <v-spacer />
                  <span><v-icon color="red">mdi-alert</v-icon>&nbsp;Erreurs pendant la publication</span>
                </template>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-col>

      <v-col
        v-if="datasets && !$vuetify.breakpoint.xsOnly"
        class="py-0 pl-2"
        sm="6"
        md="4"
        lg="2"
        xl="2"
      >
        <datasets-facets
          :facets="datasets.facets"
          :facets-values="facetsValues"
        />
      </v-col>
    </v-row>

    <v-row
      v-if="datasets && datasets.count && datasets.count > size"
    >
      <v-spacer /><v-pagination
        v-model="page"
        :length="Math.ceil(datasets.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>

    <v-responsive
      v-if="!hasDatasets"
      height="auto"
    >
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div
              v-if="!filtered"
              class="headline"
            >
              Vous n'avez pas encore ajouté de jeu de données.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                consulter la documentation
              </nuxt-link> pour en savoir plus.
            </div>
            <div
              v-else
              class="headline"
            >
              Aucun résultat ne correspond aux critères de recherche
            </div>
          </v-col>
        </v-row>
      </v-container>
    </v-responsive>
  </div>
</template>

<script>
  import SearchProgress from '../search/progress.vue'
  import SearchFilters from '../search/filters.vue'
  import DatasetsFacets from './facets.vue'
  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, DatasetsFacets },
    data: () => ({
      datasets: null,
      page: 1,
      marked,
      loading: true,
      filters: {},
      filtered: false,
      facetsValues: {
        status: {},
        owner: {},
        visibility: {},
        services: {},
        concepts: {},
      },
      lastParams: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.datasets.count > 1
      },
      size() {
        return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
      },
      hasDatasets() {
        return !this.datasets || (this.user && this.datasets.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
      },
    },
    watch: {
      facetsValues: {
        deep: true,
        handler() {
          this.page = 1
          this.refresh()
        },
      },
    },
    created() {
      if (!this.user) return
      if (this.user.organization) this.$set(this.facetsValues.owner, `organization:${this.user.organization.id}`, true)
      else this.$set(this.facetsValues.owner, `user:${this.user.id}`, true)
    },
    methods: {
      async refresh() {
        const fullFilters = { ...this.filters }
        Object.entries(this.facetsValues).forEach(([facetKey, facetValues]) => {
          const facetFilter = Object.entries(facetValues)
            .filter(([facetValue, valueActive]) => valueActive)
            .map(([facetValue]) => facetValue).join(',')
          if (facetFilter) fullFilters[facetKey] = facetFilter
        })
        const params = {
          size: this.size,
          page: this.page,
          select: 'title,description,status',
          facets: 'owner,status,visibility,services,concepts',
          sort: 'createdAt:-1',
          ...fullFilters,
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          this.datasets = await this.$axios.$get('api/v1/datasets', { params })
          this.filtered = this.filters.q !== undefined
          this.loading = false
        }
      },
    },
  }
</script>
