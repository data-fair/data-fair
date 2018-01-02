<template>
<div>
  <h3 class="md-headline">Permissions</h3>
  <md-table>
    <md-table-header>
      <md-table-row>
        <md-table-head>Portée</md-table-head>
        <md-table-head>Nom</md-table-head>
        <md-table-head>Opération</md-table-head>
      </md-table-row>
    </md-table-header>

    <md-table-body>
      <md-table-row>
        <md-table-cell>
          <md-select v-model="newPermission.type">
            <md-option :value="null">Public</md-option>
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="newPermission.id" v-if="newPermission.type">
            <md-option value="organization.id" v-for="organization in organizations" v-if="newPermission.type === 'organization'">{{organization.name}}</md-option>
            <md-option value="user.id" v-for="user in users" v-if="newPermission.type === 'user'">{{user.name}}</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="newPermission.operationId">
            <md-option :value="operation.id" v-for="operation in operations">{{operation.title}}</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell>
          <md-button class="md-icon-button md-raised md-primary" @click="addPermission">
            <md-icon>add</md-icon>
          </md-button>
        </md-table-cell>
      </md-table-row>
      <md-table-row v-for="(permission, rowIndex) in dataset.permissions" :key="rowIndex">
        <md-table-cell>
          <span v-if="!permission.type">Public</span>
          <span v-else>{{permission.type.slice(0,1).toUpperCase() + permission.type.slice(1)}}</span>
        </md-table-cell>
        <md-table-cell>
          <md-select v-model="permission.id">
            <md-option value="organization">Organisation</md-option>
            <md-option value="user">Personne</md-option>
          </md-select>
        </md-table-cell>
        <md-table-cell  v-if="operations.length">
          {{operations.find(o => o.id === permission.operationId).title}}
        </md-table-cell>
        <md-table-cell>
          <md-button class="md-icon-button md-raised md-warn" @click="removePermission(rowIndex)">
            <md-icon>remove</md-icon>
          </md-button>
        </md-table-cell>
      </md-table-row>
    </md-table-body>
  </md-table>
  <!-- <h3 class="md-headline">Transférer la propriété</h3> -->

</div>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'permissions',
  props: ['dataset', 'api'],
  data: () => ({
    newPermission: {
      type: 'organization',
      id: null,
      operationId: null
    },
    organizations: [],
    users: []
  }),
  computed: {
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary
      }))))) || []
    }
  },
  mounted() {
    this.dataset.permissions = this.dataset.permissions || []
    this.$http.get(window.CONFIG.directoryUrl + '/api/organizations').then(results => {
      this.organizations = results.data.results
    })
    this.$http.get(window.CONFIG.directoryUrl + '/api/users').then(results => {
      this.users = results.data.results
    })
  },
  methods:{
    addPermission(){
      const permission = Object.assign({}, this.newPermission)
      if (!permission.type) delete permission.type
      if (!permission.id) delete permission.id
      this.dataset.permissions.push(permission)
      this.$emit('permissions-updated')
    },
    removePermission(rowIndex){
      this.dataset.permissions.splice(rowIndex, 1)
      this.$emit('permissions-updated')
    }
  },
  watch: {
    dataset() {
      this.dataset.permissions = this.dataset.permissions || []
    }
  }
}
</script>
