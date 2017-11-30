<template>
  <div>
    <h3 class="md-display-1">{{externalApis.count}} API</h3>
    <md-layout md-row>
      <md-layout v-for="externalApi in externalApis.results" md-flex="50" md-flex-small="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'ExternalApi', params:{externalApiId:externalApi.id}}">{{externalApi.title}}</router-link>
            </div>
          </md-card-header>
          <md-card-content>
            {{externalApi.description}}
          </md-card-content>
          <md-layout flex="true"></md-layout>
          <md-card-actions>
            <!-- <a :href="externalApi.links.fields" target="_blank" v-if="externalApi.links.fields">
                <md-button>Schémas</md-button>
              </a>
              <a :href="externalApi.links.externalApidoc" target="_blank">
                <md-button>Documentation</md-button>
              </a> -->
          </md-card-actions>
          <!-- <md-layout flex="true"></md-layout> -->
          <md-card-content>
            <span v-if="externalApi.owner.type === 'user'"><md-icon>person</md-icon>{{users[externalApi.owner.id] && (users[externalApi.owner.id].firstName + ' ' + users[externalApi.owner.id].lastName)}}</span>
            <span v-if="externalApi.owner.type === 'organization'"><md-icon>group</md-icon>{{organizations[externalApi.owner.id] && organizations[externalApi.owner.id].name}}</span>


            <md-chip :class="externalApi.public ? 'md-primary' : 'md-accent'">{{externalApi.public ? 'Public' : 'Privé'}}</md-chip>
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
  name: 'external-apis',
  data: () => ({
    externalApis: {
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
    this.listExternalApis()
  },
  methods: {
    listExternalApis() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/external-apis').then(results => {
        this.externalApis = results.data
      })
    }
  },
  watch: {
    user(newVal, oldVal){
      if(!newVal || !oldVal || newVal.id != oldVal.id){
        this.listExternalApis()
      }
    },
    externalApis() {
      const orgIds = this.externalApis.results.filter(externalApi => externalApi.owner.type === 'organization').map(externalApi => externalApi.owner.id)
      if (orgIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?ids=' + orgIds.join(',')).then(results => {
          this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
            [organization.id]: organization
          })))
        })
      }
      const userIds = this.externalApis.results.filter(externalApi => externalApi.owner.type === 'user').map(externalApi => externalApi.owner.id)
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
