<template>
  <div>
    <h3 class="md-display-1">{{applicationConfigs.count}} configurations d'applications</h3>
    <md-layout md-row>
      <md-layout v-for="applicationConfig in applicationConfigs.results" md-flex="50" md-flex-small="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'ApplicationConfig', params:{applicationConfigId:applicationConfig.id}}">{{applicationConfig.title}}</router-link>
            </div>
          </md-card-header>
          <md-card-content>
            {{applicationConfig.description}}
          </md-card-content>
          <md-layout flex="true"></md-layout>
          <md-card-actions>
            <!-- <a :href="applicationConfig.links.fields" target="_blank" v-if="applicationConfig.links.fields">
                <md-button>Schémas</md-button>
              </a>
              <a :href="applicationConfig.links.applicationConfigdoc" target="_blank">
                <md-button>Documentation</md-button>
              </a> -->
          </md-card-actions>
          <!-- <md-layout flex="true"></md-layout> -->
          <md-card-content>
            <span v-if="applicationConfig.owner.type === 'user'"><md-icon>person</md-icon>{{users[applicationConfig.owner.id] && (users[applicationConfig.owner.id].firstName + ' ' + users[applicationConfig.owner.id].lastName)}}</span>
            <span v-if="applicationConfig.owner.type === 'organization'"><md-icon>group</md-icon>{{organizations[applicationConfig.owner.id] && organizations[applicationConfig.owner.id].name}}</span>

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
  name: 'application-configs',
  data: () => ({
    applicationConfigs: {
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
    this.listApplicationConfigs()
  },
  methods: {
    listApplicationConfigs() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/application-configs').then(results => {
        this.applicationConfigs = results.data
      })
    }
  },
  watch: {
    user(newVal, oldVal){
      if(!newVal || !oldVal || newVal.id != oldVal.id){
        this.listApplicationConfigs()
      }
    },
    applicationConfigs() {
      const orgIds = this.applicationConfigs.results.filter(applicationConfig => applicationConfig.owner.type === 'organization').map(applicationConfig => applicationConfig.owner.id)
      if (orgIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?ids=' + orgIds.join(',')).then(results => {
          this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
            [organization.id]: organization
          })))
        })
      }
      const userIds = this.applicationConfigs.results.filter(applicationConfig => applicationConfig.owner.type === 'user').map(applicationConfig => applicationConfig.owner.id)
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
