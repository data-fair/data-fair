<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90" v-if="settings">
    <h2 class="md-display-1" v-if="$route.params.type ==='organization'">Paramètre de l'organisation {{userOrganizations && userOrganizations[$route.params.id].name}}</h2>
    <h2 class="md-display-1" v-if="$route.params.type ==='user'">Mes paramètres personnels</h2>

    <div v-if="$route.params.type ==='organization'">
      <h3 class="md-headline">Permissions générales par rôle</h3>
      <p>Le rôle <strong>{{adminRole}}</strong> peut tout faire</p>
      <md-table v-if="operations && operations.length">
        <md-table-header>
          <md-table-row>
            <md-table-head>Opération</md-table-head>
            <md-table-head v-for="role in organizationRoles">{{role}}</md-table-head>
          </md-table-row>
        </md-table-header>


        <md-table-body>
          <md-table-row v-for="(operation, rowIndex) in Object.values(operations)" :key="rowIndex">
            <md-table-cell>
              <span>{{operation.title}}</span>
            </md-table-cell>
            <md-table-cell v-for="role in organizationRoles">
              <md-checkbox :md-value="role" v-model="settings.operationsPermissions[operation.id]" @change="save"></md-checkbox>
            </md-table-cell>
          </md-table-row>
        </md-table-body>
      </md-table>
    </div>

    <h3 class="md-headline">Webhooks</h3>
    <webhooks :settings="settings" @webhook-updated="save"></webhooks>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
import Webhooks from '../components/Webhooks.vue'

export default {
  name: 'settings',
  components:{
    Webhooks
  },
  data: () => ({
    settings: null,
    newWebhook: {
      title: null,
      events: [],
      url: null
    },
    api: null,
    organizationRoles: [],
    adminRole: window.CONFIG.adminRole
  }),
  computed: {
    ...mapState({
      user: state => state.user,
      userOrganizations: state => state.userOrganizations
    }),
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary
      }))))) || []
    }
  },
  mounted() {
    if(this.$route.params.type === 'organization'){
      this.$http.get(window.CONFIG.directoryUrl + '/api/organizations/' + this.$route.params.id + '/roles').then(results => {
        this.organizationRoles = results.data.filter(role => role !== window.CONFIG.adminRole)
      })
    }
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id).then(response => {
      this.settings = response.data
      this.$set(this.settings, 'operationsPermissions', this.settings.operationsPermissions || {})
      this.$http.get(`${window.CONFIG.publicUrl}/api/v1/api-docs.json`).then(response => {
        this.api = response.body
        this.operations.forEach(operation => {
          this.$set(this.settings.operationsPermissions, operation.id, this.settings.operationsPermissions[operation.id] || [])
        })
      })
    })
  },
  methods: {
    save() {
      this.$http.put(window.CONFIG.publicUrl + '/api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings).then(result => {
        this.$store.dispatch('notify', `Les paramètres ont bien été mis à jour`)
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour des paramètres`)
      })
    }
  }
}
</script>
