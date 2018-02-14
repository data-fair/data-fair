<template>
  <div>
    <h3 class="md-display-1">{{ remoteServices.count }} service{{ plural }} distant{{ plural }} configuré{{ plural }}</h3>
    <md-layout md-row>
      <md-layout v-for="remoteService in remoteServices.results" :key="remoteService.id" md-flex="25" md-flex-large="33" md-flex-medium="50" md-flex-xsmall="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'RemoteService', params:{remoteServiceId:remoteService.id}}">{{ remoteService.title }}</router-link>
            </div>
          </md-card-header>
          <md-card-content v-html="remoteService.description"/>
          <md-layout flex="true"/>
          <md-card-actions>
          <!-- <a :href="remoteService.links.fields" target="_blank" v-if="remoteService.links.fields">
                <md-button>Schémas</md-button>
              </a>
              <a :href="remoteService.links.remoteServicedoc" target="_blank">
                <md-button>Documentation</md-button>
              </a> -->
          </md-card-actions>
          <!-- <md-layout flex="true"></md-layout> -->
          <md-card-content>
            <span v-if="remoteService.owner.type === 'user'"><md-icon>person</md-icon>{{ users[remoteService.owner.id] && users[remoteService.owner.id].name }}</span>
            <span v-if="remoteService.owner.type === 'organization'"><md-icon>group</md-icon>{{ organizations[remoteService.owner.id] && organizations[remoteService.owner.id].name }}</span>

            <md-chip :class="remoteService.public ? 'md-primary' : 'md-accent'">{{ remoteService.public ? 'Public' : 'Privé' }}</md-chip>
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
  name: 'RemoteServicesList',
  data: () => ({
    remoteServices: {
      count: 0,
      results: []
    },
    users: {},
    organizations: {}
  }),
  computed: {
    ...mapState(['user']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    }
  },
  watch: {
    user(newVal, oldVal) {
      if (!newVal || !oldVal || newVal.id !== oldVal.id) {
        this.refresh()
      }
    },
    remoteServices() {
      const orgIds = this.remoteServices.results.filter(remoteService => remoteService.owner.type === 'organization').map(remoteService => remoteService.owner.id)
      if (orgIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?ids=' + orgIds.join(',')).then(results => {
          this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
            [organization.id]: organization
          })))
        })
      }
      const userIds = this.remoteServices.results.filter(remoteService => remoteService.owner.type === 'user').map(remoteService => remoteService.owner.id)
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
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/remote-services').then(results => {
        this.remoteServices = results.data
      })
    }
  }
}
</script>
