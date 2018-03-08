<template>
  <md-layout md-column>
    <h3 class="md-display-1">{{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données</h3>
    <md-layout md-row>
      <md-layout v-for="dataset in datasets.results" :key="dataset.id" md-flex="25" md-flex-large="33" md-flex-medium="50" md-flex-xsmall="100" style="padding:16px">
        <md-card style="width:100%">
          <md-card-header>
            <div class="md-title">
              <router-link :to="{name: 'Dataset', params:{datasetId:dataset.id}}">{{ dataset.title || dataset.id }}</router-link>
            </div>
          </md-card-header>
          <md-card-content>
            {{ dataset.description }}
          </md-card-content>
          <md-layout flex="true"/>
          <md-card-actions>
          <!-- <a :href="dataset.links.fields" target="_blank" v-if="dataset.links.fields">
                <md-button>Schémas</md-button>
              </a>
              <a :href="dataset.links.datasetdoc" target="_blank">
                <md-button>Documentation</md-button>
              </a> -->
          </md-card-actions>
          <!-- <md-layout flex="true"></md-layout> -->
          <md-card-content>
            <span v-if="dataset.owner.type === 'user'"><md-icon>person</md-icon>{{ users[dataset.owner.id] && users[dataset.owner.id].name }}</span>
            <span v-if="dataset.owner.type === 'organization'"><md-icon>group</md-icon>{{ organizations[dataset.owner.id] && organizations[dataset.owner.id].name }}</span>

            <md-chip :class="dataset.public ? 'md-primary' : 'md-accent'">{{ dataset.public ? 'Public' : 'Privé' }}</md-chip>
            <!-- <div class="md-subhead">Sources</div>
              <span v-for="(source, index) in api.sources">
          <a :href="source.link" target="_blank">{{source.name}}</a>
          <span v-if="index+1 < api.sources.length">, </span>
              </span> -->
          </md-card-content>
        </md-card>
      </md-layout>
    </md-layout>
  </md-layout>
</template>

<script>
const {mapState} = require('vuex')

export default {
  name: 'DatasetsList',
  data: () => ({
    datasets: {
      count: 0,
      results: []
    },
    users: {},
    organizations: {}
  }),
  computed: {
    ...mapState(['user']),
    plural() {
      return this.datasets.count > 1
    }
  },
  watch: {
    user(newVal, oldVal) {
      if (!newVal || !oldVal || newVal.id !== oldVal.id) {
        this.refresh()
      }
    },
    datasets() {
      const orgIds = this.datasets.results.filter(dataset => dataset.owner.type === 'organization').map(dataset => dataset.owner.id)
      if (orgIds.length) {
        this.$http.get(window.CONFIG.directoryUrl + '/api/organizations?ids=' + orgIds.join(',')).then(results => {
          this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
            [organization.id]: organization
          })))
        })
      }
      const userIds = this.datasets.results.filter(dataset => dataset.owner.type === 'user').map(dataset => dataset.owner.id)
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
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets?size=100').then(results => {
        this.datasets = results.data
      })
    }
  }
}
</script>
