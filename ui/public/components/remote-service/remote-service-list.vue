<template>
  <v-row>
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="pa-0">
        <v-subheader
          class="px-0 pr-12 mb-2"
          style="height: auto;"
        >
          {{ $t('description') }}
        </v-subheader>

        <v-row
          v-if="remoteServices"
          v-scroll="onScroll"
          class="resourcesList"
        >
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

      <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
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
            <v-list-item-title>{{ $t('configureService') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </layout-navigation-right>

      <div
        v-else
        class="actions-buttons"
      >
        <v-btn
          v-if="user && user.adminMode"
          color="primary"
          fab
          small
          :title="$t('configureService')"
          @click="importServiceSheet = true"
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

<i18n lang="yaml">
fr:
  description: Cet espace vous permet de gérer les services Web configurés pour l'interopérabilité. Ces services sont généralement utilisés pour proposer des capacités d'enrichissement aux utilisateurs. Un service interopérable peut également être un jeu de données data-fair (local ou distant).
  configureService: Configurer un service
en:
  description: This page lets you manage the Web services configured for interoperability. These services are mostly used to propose extentions to the users. An interoperable service can also be a data-fair dataset (local or remote).
  configureService: Configure a service
</i18n>

<script>
const { mapState } = require('vuex')

export default {
  data () {
    return {
      page: 1,
      loading: false,
      remoteServices: null,
      filters: {},
      filtered: false,
      lastParams: null,
      importServiceSheet: !!this.$route.query.import
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural () {
      return this.remoteServices.count > 1
    },
    size () {
      return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
    },
    importService () {
      return this.$route.query.import
    }
  },
  mounted () {
    this.refresh()
  },
  methods: {
    onScroll (e) {
      if (!this.remoteServices || this.loading) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.remoteServices.results.length < this.remoteServices.count) {
        this.refresh(true)
      }
    },
    async refresh (append) {
      this.loading = true
      if (append) this.page += 1
      else this.page = 1
      const params = {
        size: this.size,
        page: this.page,
        select: 'title,description,public,privateAccess',
        showAll: 'true',
        html: 'true',
        ...this.filters
      }
      if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
        this.lastParams = params
        const remoteServices = await this.$axios.$get('api/v1/remote-services', { params })
        if (append) remoteServices.results.forEach(r => this.remoteServices.results.push(r))
        else this.remoteServices = remoteServices
        this.$store.dispatch('breadcrumbs', [{ text: `${this.remoteServices.count} service${this.plural ? 's' : ''}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false

        // if the page is too large for the user to trigger a scroll we append results immediately
        await this.$nextTick()
        await this.$nextTick()
        const html = document.getElementsByTagName('html')
        if (html[0].clientHeight >= (html[0].scrollHeight - 200) && this.remoteServices.results.length < this.remoteServices.count) {
          this.refresh(true)
        }
      }
    }
  }
}
</script>
