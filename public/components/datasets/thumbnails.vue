<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>
        Vous pouvez consulter le journal pour en savoir plus.
      </p>
    </div>
    <v-row>
      <v-col>
        <nb-results :total="data.total" />
        <v-row class="px-3">
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
          >
            <v-select
              v-model="pagination.itemsPerPage"
              :items="[5, 10,20,50]"
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
        <v-row>
          <v-col
            v-for="(item, i) in data.results"
            :key="i"
            lg="3"
            md="4"
            sm="6"
            cols="12"
          >
            <v-card :max-width="maxThumbnailWidth">
              <v-img
                :src="item._thumbnail"
                :height="thumbnailHeight"
                :contain="dataset.thumbnails && dataset.thumbnails.resizeMode === 'fitIn'"
              />
              <v-card-title v-if="labelField || descriptionField" primary-title>
                <div>
                  <h3
                    v-if="labelField"
                    class="text-h6 mb-0"
                  >
                    {{ item[labelField.key] }}
                  </h3>
                  <div
                    v-if="descriptionField"
                    v-html="item[descriptionField.key]"
                  />
                </div>
              </v-card-title>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </div>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'
  import NbResults from '~/components/datasets/nb-results'

  export default {
    components: { NbResults },
    props: ['inititemsPerPage', 'hideitemsPerPage'],
    data: () => ({
      data: {},
      query: null,
      pagination: {
        page: 1,
        itemsPerPage: 10,
      },
      notFound: false,
      loading: false,
      maxThumbnailWidth: 300,
      thumbnailHeight: 200,
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      plural() {
        return this.data.total > 1
      },
      imageField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
      },
      labelField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label')
      },
      descriptionField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org')
      },
    },
    watch: {
      'dataset.schema'() {
        this.refresh()
      },
      'dataset.thumbnails'() {
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
      if (this.inititemsPerPage) this.pagination.itemsPerPage = this.inititemsPerPage
      this.refresh()
    },
    methods: {
      async refresh() {
        const select = []
        if (this.imageField) select.push(this.imageField.key)
        if (this.labelField) select.push(this.labelField.key)
        if (this.descriptionField) select.push(this.descriptionField.key)

        const params = {
          size: this.pagination.itemsPerPage,
          page: this.pagination.page,
          select: select.join(','),
          thumbnail: `${this.maxThumbnailWidth}x${this.thumbnailHeight}`,
        }
        if (this.query) params.q = this.query
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
</style>
