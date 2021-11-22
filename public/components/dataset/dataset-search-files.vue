<template>
  <v-container fluid class="pa-0">
    <div v-if="notFound">
      <p v-t="'noData'" />
      <p v-t="'readJournal'" />
    </div>
    <template v-else-if="data">
      <v-row class="px-3">
        <v-col class="pb-0">
          <v-row class="px-3">
            <dataset-nb-results :total="data.total" />
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
                :placeholder="$t('search')"
                append-icon="mdi-magnify"
                class="mr-3"
                outlined
                dense
                hide-details
                style="min-width:150px;"
                @input="qMode === 'complete' && refresh(true)"
                @keyup.enter.native="refresh(true)"
                @click:append="refresh(true)"
              />
            </v-col>
            <v-spacer />
            <v-col
              v-show="$vuetify.breakpoint.mdAndUp"
              xl="1"
              lg="1"
              md="2"
              class="pt-0"
            >
              <v-select
                v-model="pagination.itemsPerPage"
                :items="[10,20,50]"
                hide-details
                :label="$t('nbLines')"
              />
            </v-col>
            <v-pagination
              v-if="data.total > pagination.itemsPerPage"
              v-model="pagination.page"
              circle
              :length="Math.ceil(Math.min(data.total, 10000 - pagination.itemsPerPage) / pagination.itemsPerPage)"
              :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5"
              class="mx-4"
            />
          </v-row>
        </v-col>
      </v-row>
      <v-container
        fluid
        class="search-results"
      >
        <v-row
          v-for="(item, i) in data.results"
          :key="i"
        >
          <v-col cols="12">
            <h4><a :href="item._attachment_url || item[fileProperty.key]">{{ item[fileProperty.key] }}</a></h4>
            <p
              class="text-body-1"
              v-html="item._highlight['_file.content'].join('... ')"
            />
          </v-col>
        </v-row>
      </v-container>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noData: Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.
  readJournal: Vous pouvez consulter le journal pour en savoir plus.
  search: Rechercher
  nbLines: Nombre de lignes
en:
  noData: The data is not accessible. Either the dataset was not yet entirely processed, or there was an error.
  readJournal: You can check the activity journal to learn more.
  search: Search
  nbLines: Number of lines
</i18n>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      data: null,
      query: null,
      pagination: {
        page: 1,
        itemsPerPage: 10,
      },
      notFound: false,
      loading: false,
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl', 'qMode']),
      fileProperty() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      plural() {
        return this.data.total > 1
      },
    },
    watch: {
      'dataset.schema'() {
        this.refresh()
      },
      pagination: {
        handler () {
          this.refresh()
        },
        deep: true,
      },
    },
    mounted() {
      this.refresh()
    },
    methods: {
      async refresh(resetPagination) {
        if (resetPagination) {
          this.pagination.page = 1
          return
        }

        const params = {
          size: this.pagination.itemsPerPage,
          page: this.pagination.page,
          select: [this.fileProperty.key, '_file.content_type', '_file.content_length', '_attachment_url'].join(','),
          highlight: '_file.content',
          qs: `_exists_:${this.fileProperty.key}`,
          q_mode: this.qMode,
        }
        if (this.query) params.q = this.query
        if (this.dataset.draftReason) params.draft = 'true'

        // prevent triggering multiple times the same request
        const paramsStr = JSON.stringify(params)
        if (paramsStr === this.lastParams) return
        this.lastParams = paramsStr

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
    },
  }
</script>

<style lang="less">
  .search-results {
    .highlighted {
      font-weight: bold;
    }
  }
</style>
