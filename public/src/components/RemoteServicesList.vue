<template>
  <div>
    <h3 class="md-display-1">{{remoteServices.count}} services distants configurés</h3>
    <md-layout md-row>
      <md-layout v-for="remoteService in remoteServices.results" md-flex="50" md-flex-small="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'RemoteService', params:{remoteServiceId:remoteService.id}}">{{remoteService.title}}</router-link>
            </div>
          </md-card-header>
          <md-card-content>
            {{remoteService.description}}
          </md-card-content>
          <md-layout flex="true"></md-layout>
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
            <span v-if="remoteService.owner.type === 'user'"><md-icon>person</md-icon>{{users[remoteService.owner.id] && users[remoteService.owner.id].name}}</span>
            <span v-if="remoteService.owner.type === 'organization'"><md-icon>group</md-icon>{{organizations[remoteService.owner.id] && organizations[remoteService.owner.id].name}}</span>


            <md-chip :class="remoteService.public ? 'md-primary' : 'md-accent'">{{remoteService.public ? 'Public' : 'Privé'}}</md-chip>
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
const {
  mapState
} = require('vuex')

export default {
  name: 'remote-services',
  data: () => ({
    remoteServices: {
      count: 0,
      results: []
    },
    users: {},
    organizations: {}
  }),
  computed: {
    ...mapState({
      user: state => state.user
    })
  },
  mounted() {
    this.listRemoteServices()
  },
  methods: {
    listRemoteServices() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/remote-services').then(results => {
        this.remoteServices = results.data
      })
    }
  },
  watch: {
    user(newVal, oldVal){
      if(!newVal || !oldVal || newVal.id != oldVal.id){
        this.listRemoteServices()
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
  }
}
</script>
