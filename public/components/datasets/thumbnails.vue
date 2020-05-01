<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>
        Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">
          le journal
        </nuxt-link> pour en savoir plus.
      </p>
    </div>
    <v-row column>
      <v-row column>
        <h3 v-if="data.total <= 10000">
          Consultez {{ data.total.toLocaleString() }} {{ plural ? 'enregistrements' : 'enregistrement' }}
        </h3>
        <h3 v-if="data.total > 10000">
          Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} {{ plural ? 'premiers enregistrements' : 'premier enregistrement' }} ({{ data.total.toLocaleString() }} au total)
        </h3>
        <v-row>
          <v-text-field
            v-model="query"
            label="Rechercher"
            append-icon="mdi-magnify"
            class="mr-3"
            style="min-width:150px;"
            @keyup.enter.native="refresh"
            @click:append="refresh"
          />
          <v-spacer />
          <v-col
            v-if="!hideRowsPerPage && data.total > pagination.rowsPerPage"
            sm="4"
            md="2"
            lg="1"
            xl="1"
          >
            <v-select
              v-model="pagination.rowsPerPage"
              :items="[10,20,50]"
              label="Nombre de lignes"
            />
          </v-col>
          <v-pagination
            v-if="data.total > pagination.rowsPerPage"
            v-model="pagination.page"
            :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)"
            :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5"
            class="mx-4"
          />
        </v-row>
        <v-container
          fluid
          grid-list-lg
          class="pa-0"
        >
          <v-row>
            <v-col
              v-for="(item, i) in data.results"
              :key="i"
              lg="2"
              md="3"
              sm="6"
              cols="12"
            >
              <v-card :max-width="maxThumbnailWidth">
                <v-img
                  :src="item._thumbnail"
                  :height="thumbnailHeight"
                />
                <v-card-title primary-title>
                  <div>
                    <h3
                      v-if="labelField"
                      class="headline mb-0"
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
        </v-container>
      </v-row>
    </v-row>
  </div>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    props: ['initRowsPerPage', 'hideRowsPerPage'],
    data: () => ({
      data: {},
      query: null,
      pagination: {
        page: 1,
        rowsPerPage: 12,
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
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/description')
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
      if (this.initRowsPerPage) this.pagination.rowsPerPage = this.initRowsPerPage
      this.refresh()
    },
    methods: {
      async refresh() {
        const select = []
        if (this.imageField) select.push(this.imageField.key)
        if (this.labelField) select.push(this.labelField.key)
        if (this.descriptionField) select.push(this.descriptionField.key)

        const params = {
          size: this.pagination.rowsPerPage,
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
