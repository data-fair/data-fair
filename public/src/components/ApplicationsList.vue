<template>
  <div>
    <h3 class="md-display-1">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>
    <md-layout md-row>
      <md-layout v-for="application in applications.results" :key="application.id" md-flex="25" md-flex-large="33" md-flex-medium="50" md-flex-xsmall="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'Application', params:{applicationId:application.id}}">{{ application.title || application.id }}</router-link>

              <md-button class="md-icon-button md-primary md-dense" :href="application.href" target="_blank" style="float:right">
                <md-icon>exit_to_app</md-icon>
                <md-tooltip md-direction="top">Accéder à l'application</md-tooltip>
              </md-button>
            </div>
          </md-card-header>
          <md-card-content>
            {{ application.description }}
          </md-card-content>
          <md-layout flex="true"/>
          <md-card-actions>
          <!-- <a :href="application.links.fields" target="_blank" v-if="application.links.fields">
                <md-button>Schémas</md-button>
              </a>
              <a :href="application.links.applicationdoc" target="_blank">
                <md-button>Documentation</md-button>
              </a> -->
          </md-card-actions>
          <!-- <md-layout flex="true"></md-layout> -->
          <md-card-content>
            <span v-if="application.owner.type === 'user'"><md-icon>person</md-icon>{{ users[application.owner.id] && users[application.owner.id].name }}</span>
            <span v-if="application.owner.type === 'organization'"><md-icon>group</md-icon>{{ organizations[application.owner.id] && organizations[application.owner.id].name }}</span>

            <!-- <div class="md-subhead">Sources</div>
              <span v-for="(source, index) in api.sources">
          <a :href="source.link" target="_blank">{{source.name}}</a>
          <span v-if="index+1 < api.sources.length">, </span>
              </span> -->
          </md-card-content>
        </md-card>
      </md-layout>
    </md-layout>
  </div>
</template>

<script>
const {mapState} = require('vuex')

export default {
  name: 'ApplicationsList',
  data: () => ({
    applications: {
      count: 0,
      results: []
    },
    users: {},
    organizations: {}
  }),
  computed: {
    ...mapState(['user']),
    plural() {
      return this.applications.count > 1 ? 's' : ''
    }
  },
  watch: {
    user(newVal, oldVal) {
      if (!newVal || !oldVal || newVal.id !== oldVal.id) {
        this.refresh()
      }
    },
    applications() {
      const orgIds = this.applications.results.filter(application => application.owner.type === 'organization').map(application => application.owner.id)
      if (orgIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?ids=' + orgIds.join(',')).then(results => {
          this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
            [organization.id]: organization
          })))
        })
      }
      const userIds = this.applications.results.filter(application => application.owner.type === 'user').map(application => application.owner.id)
      if (userIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/users?ids=' + userIds.join(',')).then(results => {
          this.users = Object.assign({}, ...results.data.results.map(user => ({
            [user.id]: user
          })))
        })
      }
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    refresh() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/applications').then(results => {
        this.applications = results.data
        this.applications.results.forEach(app => { app.href = window.CONFIG.publicUrl + '/app/' + app.id })
      })
    }
  }
}
</script>
