<template>
<div>
  <md-layout md-align="center">
    <md-layout md-column md-flex="90">
      <md-layout md-row>
        <md-layout md-column md-flex="60">
          <h3 class="md-display-1">Vous pouvez consulter {{datasets.count}} jeux de données</h3>
          <md-layout md-row>
            <md-layout v-for="dataset in datasets.results" md-flex="50" md-flex-small="100" style="padding:16px">
              <md-card style="width:100%">
                <md-card-header>
                  <div class="md-title">{{dataset.title}}</div>
                </md-card-header>
                <md-card-content>
                  {{dataset.description}}
                </md-card-content>
                <md-layout flex="true"></md-layout>
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
                  <span v-if="dataset.owner.type === 'user'"><md-icon>person</md-icon></span>
                  <span v-if="dataset.owner.type === 'organization'"><md-icon>group</md-icon>{{organizations[dataset.owner.id] && organizations[dataset.owner.id].name}}</span>


                  <md-chip :class="dataset.public ? 'md-primary' : 'md-accent'">{{dataset.public ? 'Public' : 'Privé'}}</md-chip>
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
        <md-layout md-column md-flex="40">
          <import-file></import-file>
        </md-layout>
      </md-layout>

    </md-layout>
  </md-layout>
</div>
</template>

<script>
import ImportFile from '../components/ImportFile.vue'

const {
  mapState
} = require('vuex')

export default {
  name: 'home',
  components:{
    ImportFile
  },
  data: () => ({
    datasets: {count: 0, results:[]},
    organizations: {}
  }),
  computed: {
    ...mapState({
      user: state => state.user
    })
  },
  mounted() {
    this.listDatasets()
  },
  methods: {
    listDatasets() {
      this.$http.get(window.CONFIG.baseUrl + '/api/v1/datasets').then(results => {
        this.datasets = results.data
      })
    }
  },
  watch:{
    datasets(){
      const orgIds = this.datasets.results.filter(dataset => dataset.owner.type === 'organization').map(dataset => dataset.owner.id)
      this.$http.get(window.CONFIG.koumoulUrl + '/api/organizations?ids='+orgIds.join(',')).then(results => {
        console.log(results.data)

        this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
          [organization.id]: organization
        })))
        console.log(this.organizations)
      })
    }
  }
}
</script>
