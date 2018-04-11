<template>
  <div>
    <h3 class="headline mt-3 mb-3">Propriétaire</h3>
    <span>{{ (resource.owner.type === 'user' ? 'Utilisateur ' : 'Organisation ') + resource.owner.name }}</span>

    <h3 class="headline mt-3 mb-3">Permissions</h3>
    <v-btn id="new-permissions" color="primary" @click="showDialog = true">Ajouter des permissions</v-btn>
    <v-data-table
      v-if="permissions && permissions.length"
      :headers="[{text: 'Portée', sortable: false}, {text: 'Opérations', sortable: false}, { text: '', sortable: false }]"
      :items="permissions"
      hide-actions
      class="elevation-1 mt-3"
    >
      <template slot="items" slot-scope="props">
        <tr>
          <td>
            <div v-if="!props.item.type">Public</div>
            <div v-else>{{ props.item.type === 'user' ? ('Utilisateur ' + (usersMap[props.item.id] && usersMap[props.item.id].name)) : ('Organisation ' + (organizationsMap[props.item.id] && organizationsMap[props.item.id].name)) }}</div>
            <div v-if="props.item.type === 'organization' && (!props.item.roles || !props.item.roles.length)">Tout le monde</div>
            <div v-if="props.item.type === 'organization' && (props.item.roles && props.item.roles.length)">Restreint aux rôles : {{ props.item.roles.join(', ') }}</div>
          </td>
          <td>
            <span v-if="!props.item.operations.length">Toutes</span>
            <ul v-else>
              <li v-for="operation in props.item.operations.map(oid => operations.find(o => o.id === oid))" :key="operation.id">{{ operation.title }}</li>
            </ul>
          </td>
          <td class="text-xs-right">
            <v-btn flat icon color="warning" @click="removePermission(props.index)">
              <v-icon>delete</v-icon>
            </v-btn>
          </td>
        </tr>
      </template>
    </v-data-table>

    <v-dialog v-model="showDialog" max-width="800">
      <v-card>
        <v-card-title>Ajout de nouvelles permissions</v-card-title>

        <v-card-text>
          <v-select
            :items="[{value: null, label: 'Public'}, {value: 'organization', label: 'Organisation'}, {value: 'user', label: 'Utilisateur'}]"
            item-text="label"
            item-value="value"
            v-model="newPermission.type"
            label="Portée"
            required
          />

          <v-select
            v-if="newPermission.type"
            :items="newPermission.type === 'organization' ? organizations : users"
            item-text="name"
            item-value="id"
            v-model="newPermission.id"
            label="Nom"
            required
          />

          <v-select
            v-if="newPermission.type === 'organization' && newPermissionOrganizationRoles.length"
            :items="newPermissionOrganizationRoles"
            label="Restreindre à des rôles"
            multiple
            v-model="newPermission.roles"
          />

          <v-select
            :items="Object.values(operations)"
            item-text="title"
            item-value="id"
            v-model="newPermission.operations"
            label="Opérations (toutes si aucune cochée)"
            multiple
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showDialog = false" flat>Annuler</v-btn>
          <v-btn color="primary" @click="addPermission">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script>
import {mapState} from 'vuex'
import eventBus from '../event-bus'

function initPermission() {
  return {
    type: 'organization',
    id: null,
    roles: [],
    operations: []
  }
}

export default {
  name: 'Permissions',
  props: ['resource', 'resourceUrl', 'api'],
  data: () => ({
    permissions: [],
    newPermission: initPermission(),
    newPermissionOrganizationRoles: [],
    users: [],
    organizations: [],
    showDialog: false
  }),
  computed: {
    ...mapState(['user', 'env']),
    operations() {
      return (this.api && [].concat(...Object.keys(this.api.paths).map(path => Object.keys(this.api.paths[path]).map(method => ({
        id: this.api.paths[path][method].operationId,
        title: this.api.paths[path][method].summary
      }))))) || []
    },
    organizationsMap() {
      return Object.assign({}, ...this.organizations.map(organization => ({
        [organization.id]: organization
      })))
    },
    usersMap() {
      return Object.assign({}, ...this.users.map(user => ({
        [user.id]: user
      })))
    }
  },
  watch: {
    'newPermission.id': async function(id) {
      if (this.newPermission.type === 'organization' && id) {
        if ((this.resource.owner.type === 'organization' && this.resource.owner.id === id) || (this.resource.owner.type === 'user' && this.user.organizations.find(o => o.id === id))) {
          const roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + id + '/roles')
          this.newPermissionOrganizationRoles = roles.filter(role => role !== this.env.adminRole)
        } else {
          this.newPermissionOrganizationRoles = []
        }
      }
    }
  },
  async mounted() {
    this.permissions = await this.$axios.$get(this.resourceUrl + '/permissions')
    this.organizations = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations')).results
    this.users = (await this.$axios.$get(this.env.directoryUrl + '/api/users')).results
  },
  methods: {
    async save() {
      try {
        await this.$axios.$put(this.resourceUrl + '/permissions', this.permissions)
        this.$store.dispatch('notify', `Les permissions ont bien été mises à jour`)
      } catch (error) {
        eventBus.$emit('notification', {type: 'error', msg: `Erreur "${error.status || error.message}" pendant la mise à jour des permissions`})
      }
    },
    addPermission() {
      const permission = Object.assign({}, this.newPermission)
      this.newPermission = initPermission()
      if (!permission.type) delete permission.type
      if (!permission.id) delete permission.id
      this.permissions.push(permission)
      this.showDialog = false
      this.save()
    },
    removePermission(rowIndex) {
      this.permissions.splice(rowIndex, 1)
      this.save()
    }
  }
}
</script>
