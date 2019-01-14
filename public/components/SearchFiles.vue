<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">le journal</nuxt-link> pour en savoir plus.</p>
    </div>
    <v-card v-if="data">
      <v-card-title style="padding-bottom: 0;">
        <v-layout column>
          <h3 v-if="data.total <= 10000">Consultez {{ data.total.toLocaleString() }} {{ plural ? 'enregistrements' : 'enregistrement' }}</h3>
          <h3 v-if="data.total > 10000">Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} {{ plural ? 'premiers enregistrements' : 'premier enregistrement' }} ({{ data.total.toLocaleString() }} au total)</h3>
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
                :items="[10,20,50]"
                v-model="pagination.rowsPerPage"
                label="Nombre de lignes"
              />
            </v-flex>
            <v-pagination v-if="data.total > pagination.rowsPerPage" v-model="pagination.page" :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)" :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5" class="mx-4"/>
          </v-layout>
        </v-layout>
      </v-card-title>
      <v-container fluid class="search-results">
        <v-layout v-for="(item, i) in data.results" :key="i" row wrap>
          <v-flex xs12>
            <h4><a :href="resourceUrl + '/attachments/' + item[fileProperty.key]">{{ item[fileProperty.key] }}</a></h4>
            <p class="body-1" v-html="item._highlight['_file.content'].join('... ')" />
          </v-flex>
        </v-layout>
      </v-container>
    </v-card>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '../event-bus'

export default {
  props: ['initRowsPerPage', 'hideRowsPerPage'],
  data: () => ({
    data: null,
    query: null,
    pagination: {
      page: 1,
      rowsPerPage: 10
    },
    notFound: false,
    loading: false
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    fileProperty() {
      return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    },
    plural() {
      return this.data.total > 1
    }
  },
  watch: {
    'dataset.schema'() {
      this.refresh()
    },
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    }
  },
  mounted() {
    if (this.initRowsPerPage) this.pagination.rowsPerPage = this.initRowsPerPage
    this.refresh()
  },
  methods: {
    async refresh() {
      // this.data = {}
      const params = {
        size: this.pagination.rowsPerPage,
        page: this.pagination.page,
        select: [this.fileProperty.key, '_file.content_type', '_file.content_length'].join(','),
        highlight: '_file.content',
        qs: `_exists_:${this.fileProperty.key}`
      }
      if (this.query) params.q = this.query
      this.loading = true
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
        this.notFound = false
      } catch (error) {
        if (error.response && error.response.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des données` })
      }
      this.loading = false
    }
  }
}
</script>

<style lang="less">
  .search-results {
    .highlighted {
      font-weight: bold;
    }
  }
</style>
