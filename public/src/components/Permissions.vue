<template>
<div>
  <h3 class="md-headline">Propriétaire</h3>
  <span>{{resource.owner.type === 'user' ? ('Utilisateur ' + (users[resource.owner.id] && users[resource.owner.id].name)) : ('Organisation ' + (organizations[resource.owner.id] && organizations[resource.owner.id].name))}}</span>

  <h3 class="md-headline">Permissions</h3>
  <md-button id="new-permissions" class="md-raised md-primary" @click="$refs['new-permissions-dialog'].open()">Ajouter des permissions</md-button>
  <md-list v-if="resource">
    <md-list-item v-for="(permission, rowIndex) in resource.permissions" style="padding:8px 0">
      <md-card style="padding:16px;width:100%">
        <md-layout md-row md-vertical-align="center">
          <md-layout md-flex="30" md-column>
            <md-subheader>Portée</md-subheader>
            <span v-if="!permission.type">Public</span>
            <span v-else>{{permission.type === 'user' ? ('Utilisateur ' + (users[permission.id] && users[permission.id].name)) : ('Organisation ' + (organizations[permission.id] && organizations[permission.id].name))}}</span>
            <span v-if="permission.type === 'organization' && (!permission.roles || !permission.roles.length)">Tout le monde</span>
            <span v-if="permission.type === 'organization' && (permission.roles && permission.roles.length)">Restreint aux rôles : {{permission.roles.join(', ')}}</span>
          </md-layout>

          <md-layout md-flex="60" md-column v-if="operations && operations.length">
            <md-subheader>Opérations</md-subheader>
            <ul>
              <li v-for="operation in permission.operations.map(oid => operations.find(o => o.id === oid))">{{operation.title}}</li>
            </ul>
          </md-layout>

          <md-layout md-flex="5" md-flex-offset="5" md-column v-if="operations && operations.length">
            <md-button class="md-icon-button md-raised md-warn md-dense" @click="removePermission(rowIndex)">
              <md-icon>remove</md-icon>
            </md-button>
          </md-layout>
        </md-layout>
      </md-card>
    </md-list-item>
  </md-list>

  <md-dialog md-open-from="#new-permissions" md-close-to="#new-permissions" ref="new-permissions-dialog">
    <md-dialog-title>Ajout de nouvelles permissions</md-dialog-title>

    <md-dialog-content>
      <md-input-container>
        <label>Portée</label>
        <md-select v-model="newPermission.type">
          <md-option :value="null">Public</md-option>
          <md-option value="organization">Organisation</md-option>
          <md-option value="user">Utilisateur</md-option>
        </md-select>
      </md-input-container>

      <md-input-container v-if="newPermission.type === 'organization' || newPermission.type === 'user'">
        <label>Nom</label>
        <md-select v-model="newPermission.id">
          <md-option :value="organization.id" v-for="organization in organizations" v-if="newPermission.type === 'organization'">{{organization.name}}</md-option>
          <md-option :value="user.id" v-for="user in Object.values(users)" v-if="newPermission.type === 'user'">{{user.name}}</md-option>
        </md-select>
      </md-input-container>

      <md-input-container v-if="newPermission.type === 'organization' && newPermissionOrganizationRoles.length">
        <label>Restreindre à des rôles</label>
        <md-select v-model="newPermission.roles" multiple>
          <md-option :value="role" v-for="role in newPermissionOrganizationRoles">{{role}}</md-option>
        </md-select>
      </md-input-container>

      <md-layout md-column>
        <md-subheader>Opérations</md-subheader>
        <md-checkbox :md-value="operation.id" v-model="newPermission.operations" v-for="operation in Object.values(operations)">{{operation.title}}</md-checkbox>
      </md-layout>
    </md-dialog-content>

    <md-dialog-actions>
      <md-button class="md-warn md-raised" @click="$refs['new-permissions-dialog'].close()">Annuler</md-button>
      <md-button class="md-success md-raised" @click="addPermission">Ajouter</md-button>
    </md-dialog-actions>
  </md-dialog>

</div>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'permissions',
  props: ['resource', 'api'],
  data: () => ({
    newPermission: {
      type: 'organization',
      id: null,
      roles: [],
      operations: []
    },
    organizations: {},
    users: {},
    newPermissionOrganizationRoles: []
  }),
  computed: {
    ...mapState({
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
    this.resource.permissions = this.resource.permissions || []
    this.$http.get(window.CONFIG.directoryUrl + '/api/organizations').then(results => {
      this.organizations = Object.assign({}, ...results.data.results.map(organization => ({
        [organization.id]: organization
      })))
    })
    this.$http.get(window.CONFIG.directoryUrl + '/api/users').then(results => {
      this.users = Object.assign({}, ...results.data.results.map(user => ({
        [user.id]: user
      })))
    })
  },
  methods: {
    addPermission() {
      const permission = Object.assign({}, this.newPermission)
      if (!permission.type) delete permission.type
      if (!permission.id) delete permission.id
      this.resource.permissions.push(permission)
      this.$refs['new-permissions-dialog'].close()
      this.$emit('permissions-updated')
    },
    removePermission(rowIndex) {
      this.resource.permissions.splice(rowIndex, 1)
      this.$emit('permissions-updated')
    }
  },
  watch: {
    resource() {
      this.resource.permissions = this.resource.permissions || []
    },
    'newPermission.id': function(id) {
      if (this.newPermission.type === 'organization' && id) {
        if((this.resource.owner.type === 'organization' && this.resource.owner.id === id) || (this.resource.owner.type === 'user' && this.userOrganizations[id])){
          this.$http.get(window.CONFIG.directoryUrl + '/api/organizations/' + id + '/roles').then(results => {
            this.newPermissionOrganizationRoles = results.data.filter(role => role !== window.CONFIG.adminRole)
          })
        }else{
          this.newPermissionOrganizationRoles = []
        }
      }
    }
  }
}
</script>
