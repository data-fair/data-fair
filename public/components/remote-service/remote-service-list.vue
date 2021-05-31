<template>
  <v-row>
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-subheader class="px-0 pr-12 mb-2">
          {{ $t('pages.services.description') }}
        </v-subheader>

        <v-container
          v-scroll="onScroll"
          class="pa-0"
          fluid
        >
          <v-row v-if="remoteServices" class="resourcesList">
            <v-col
              v-for="remoteService in remoteServices.results"
              :key="remoteService.id"
              cols="12"
              md="6"
              lg="4"
            >
              <remote-service-card :remote-service="remoteService" />
            </v-col>
            <search-progress :loading="loading" />
          </v-row>
        </v-container>

        <v-row v-if="remoteServices && remoteServices.count > size">
          <v-spacer />
          <v-pagination
            v-model="page"
            circle
            :length="Math.ceil(remoteServices.count / size)"
            @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
          />
        </v-row>
      </v-container>

      <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
        <v-list
          v-if="user && user.adminMode"
          dense
          class="list-actions"
        >
          <v-list-item @click="importServiceSheet = true">
            <v-list-item-icon>
              <v-icon color="primary">
                mdi-plus-circle
              </v-icon>
            </v-list-item-icon>
            <v-list-item-title>Configurer un service</v-list-item-title>
          </v-list-item>
        </v-list>
      </layout-navigation-right>

      <div v-else class="actions-buttons">
        <v-btn
          v-if="user && user.adminMode"
          color="primary"
          fab
          small
          title="Configurer un catalogue"
          @click="importCatalogSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importServiceSheet">
          <remote-service-import
            v-if="importServiceSheet"
            :init-service="importService"
            @cancel="importServiceSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-col>
  </v-row>
</template>

<script>
  const { mapState } = require('vuex')

  export default {
    data() {
      return {
        page: 1,
        loading: true,
        remoteServices: null,
        filters: {},
        filtered: false,
        importServiceSheet: !!this.$route.query.import,
      }
    },
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.remoteServices.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
      importService() {
        return this.$route.query.import
      },
    },
    created() {
      this.refresh()
    },
    methods: {
      onScroll(e) {
        if (!this.datasets) return
        const se = e.target.scrollingElement
        if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.datasets.results.length < this.datasets.count) {
          this.refresh(true)
        }
      },
      async refresh(append) {
        this.loading = true
        if (append) this.page += 1
        else this.page = 1
        const remoteServices = await this.$axios.$get('api/v1/remote-services', {
          params: {
            size: this.size,
            page: this.page,
            select: 'title,description,public,privateAccess',
            showAll: 'true',
            ...this.filters,
          },
        })
        if (append) remoteServices.results.forEach(r => this.remoteServices.results.push(r))
        else this.remoteServices = remoteServices
        this.$store.dispatch('breadcrumbs', [{ text: `${this.remoteServices.count} service${this.plural ? 's' : ''}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false

        // if the page is too large for the user to trigger a scroll we append results immediately
        await this.$nextTick()
        await this.$nextTick()
        const html = document.getElementsByTagName('html')
        if (html[0].scrollHeight === html[0].clientHeight && this.remoteServices.results.length < this.remoteServices.count) {
          this.refresh(true)
        }
      },
    },
  }
</script>
