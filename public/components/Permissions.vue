<template>
  <div>
    <h3 class="headline mt-3 mb-3">Propriétaire</h3>
    <div v-if="resource.owner.type === 'user'">Utilisateur {{ resource.owner.name }}</div>
    <div v-else>
      <span>Organisation {{ resource.owner.name }}</span>
      <span v-if="resource.owner.role"> restreinte au rôle {{ resource.owner.role }}</span>
    </div>

    <h3 class="headline mt-3 mb-3">Permissions</h3>
    <v-btn id="new-permissions" color="primary" @click="currentPermission = initPermission();addPermissions = true;showDialog = true">Ajouter des permissions</v-btn>
    <v-data-table
      v-if="permissions && permissions.length"
      :headers="[{text: 'Portée', sortable: false}, {text: 'Actions', sortable: false}, { text: '', sortable: false }]"
      :items="permissions"
      hide-actions
      class="elevation-1 mt-3"
    >
      <template slot="items" slot-scope="props">
        <tr>
          <td>
            <div v-if="!props.item.type">Public</div>
            <div v-else>{{ (props.item.type === 'user' ? 'Utilisateur ' : 'Organisation ') + props.item.name }}</div>
            <div v-if="props.item.type === 'organization' && (!props.item.roles || !props.item.roles.length)">Tout le monde</div>
            <div v-if="props.item.type === 'organization' && (props.item.roles && props.item.roles.length)">Restreint aux rôles : {{ props.item.roles.join(', ') }}</div>
          </td>
          <td>
            <v-list dense>
              <v-list-tile v-for="(classOperations, permClass) in permissionClasses" v-if="(props.item.classes && props.item.classes.includes(permClass)) || classOperations.filter(o => props.item.operations.includes(o.id)).length" :key="permClass">
                <v-list-tile-content>
                  <v-layout row style="width:100%">
                    <v-flex xs3>{{ classNames[permClass] }}</v-flex>
                    <v-flex xs9>
                      <span v-if="props.item.classes && props.item.classes.includes(permClass)">Toutes</span>
                      <ul v-else>
                        <li v-for="operation in classOperations.filter(o => props.item.operations.find(oid => o.id && o.id === oid))" :key="operation.id">{{ operation.title }}</li>
                      </ul>
                    </v-flex>
                  </v-layout>
                </v-list-tile-content>
              </v-list-tile>
            </v-list>
          </td>
          <td class="text-xs-right">
            <v-btn flat icon color="warning" @click="currentPermission = props.item;showDialog = true">
              <v-icon>edit</v-icon>
            </v-btn>
            <v-btn flat icon color="warning" @click="removePermission(props.index)">
              <v-icon>delete</v-icon>
            </v-btn>
          </td>
        </tr>
      </template>
    </v-data-table>

    <v-dialog v-model="showDialog" max-width="800" persistent>
      <v-card>
        <v-card-title>Editer un ensemble de permissions</v-card-title>

        <v-card-text>
          <v-select
            :items="[{value: null, label: 'Public'}, {value: 'organization', label: 'Organisation'}, {value: 'user', label: 'Utilisateur'}]"
            item-text="label"
            item-value="value"
            v-model="currentPermission.type"
            label="Portée"
            required
          />

          <v-autocomplete
            v-if="currentPermission.type"
            :items="currentPermission.type === 'organization' ? organizations : users"
            item-text="name"
            item-value="id"
            v-model="currentEntity"
            label="Nom"
            required
            :search-input.sync="search"
            :loading="loading"
            cache-items
            hide-no-data
            return-object
          />

          <v-select
            v-if="currentPermission.type === 'organization' && currentPermissionOrganizationRoles.length"
            :items="currentPermissionOrganizationRoles"
            label="Rôles (tous si aucun coché)"
            multiple
            v-model="currentPermission.roles"
          />

          <v-select
            v-if="!expertMode"
            :items="Object.keys(permissionClasses).filter(c => classNames[c]).map(c => ({class: c, title: classNames[c]}))"
            item-text="title"
            item-value="class"
            v-model="currentPermission.classes"
            label="Actions"
            multiple
          >
            <template slot="item" slot-scope="data">
              <template>
                <v-list-tile-action>
                  <v-checkbox v-model="currentPermission.classes" :value="data.item.class" :off-icon="permissionClasses[data.item.class].filter(o => !(currentPermission.operations || []).includes(o.id)).length === 0 ? '$vuetify.icons.checkboxOn' : '$vuetify.icons.checkboxOff'"/>
                </v-list-tile-action>
                <v-list-tile-content v-html="data.item.title"/>
              </template>
            </template>
          </v-select>

          <v-select
            v-if="expertMode"
            :items="operations"
            item-text="title"
            item-value="id"
            v-model="currentPermission.operations"
            label="Actions"
            multiple
          >
            <template slot="item" slot-scope="data">
              <template v-if="typeof data.item !== 'object'">
                <v-list-tile-content v-text="data.item"/>
              </template>
              <template v-else>
                <v-list-tile-action>
                  <v-checkbox v-model="currentPermission.operations" :value="data.item.id" :off-icon="currentPermission.classes.includes(data.item.class) ? '$vuetify.icons.checkboxOn' : '$vuetify.icons.checkboxOff'"/>
                </v-list-tile-action>
                <v-list-tile-content v-html="data.item.title"/>
              </template>
            </template>
          </v-select>

          <v-switch
            color="primary"
            label="Mode expert"
            v-model="expertMode"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showDialog = false" flat>Annuler</v-btn>
          <v-btn color="primary" :disabled="(currentPermission.type && !currentPermission.id) || ((!currentPermission.operations || !currentPermission.operations.length) && (!currentPermission.classes ||!currentPermission.classes.length))" @click="showDialog = false;save()">Valider</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script>
import {mapState} from 'vuex'
import eventBus from '../event-bus'

export default {
  name: 'Permissions',
  props: ['resource', 'resourceUrl', 'api'],
  data: () => ({
    permissions: [],
    currentPermission: {},
    currentPermissionOrganizationRoles: [],
    currentEntity: {},
    users: [],
    organizations: [],
    showDialog: false,
    search: null,
    loading: false,
    classNames: {
      list: 'Lister',
      read: 'Lecture',
      // write: 'Ecriture',
      // admin: 'Administration',
      use: 'Utiliser le service'
    },
    expertMode: false,
    addPermissions: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    permissionClasses() {
      const classes = {
        list: [{
          id: 'list',
          title: 'Lister la ressource',
          class: 'list'
        }]
      }
      if (this.api) {
        Object.keys(this.api.paths).forEach(path => Object.keys(this.api.paths[path]).forEach(method => {
          const permClass = this.api.paths[path][method]['x-permissionClass']
          classes[permClass] = (classes[permClass] || []).concat({
            id: this.api.paths[path][method].operationId,
            title: this.api.paths[path][method].summary,
            class: permClass
          })
        }))
      }
      return classes
    },
    operations() {
      return [].concat(...Object.keys(this.permissionClasses).filter(c => this.classNames[c]).map(c => [{header: this.classNames[c]}].concat(this.permissionClasses[c])))
    }
  },
  watch: {
    'currentPermission.type'() {
      this.currentPermission.id = this.currentPermission.id || null
      this.currentPermission.roles = this.currentPermission.roles || []
    },
    'currentEntity.id': async function(id) {
      this.currentPermission.id = this.currentEntity.id
      this.currentPermission.name = this.currentEntity.name
      if (this.currentPermission.type === 'organization' && id) {
        if ((this.resource.owner.type === 'organization' && this.resource.owner.id === id) || (this.resource.owner.type === 'user' && this.user.organizations.find(o => o.id === id))) {
          const roles = await this.$axios.$get(this.env.directoryUrl + '/api/organizations/' + id + '/roles')
          this.currentPermissionOrganizationRoles = roles.filter(role => role !== this.env.adminRole)
        } else {
          this.currentPermissionOrganizationRoles = []
        }
      }
    },
    'currentPermission.classes'(classes) {
      if (classes.includes('list') && !classes.includes('read')) {
        classes.push('read')
      }
    },
    'currentPermission.operations'(operations) {
      if (operations.includes('list') && !operations.includes('readDescription')) {
        operations.push('readDescription')
      }
    },
    search: async function() {
      console.log('SEARCH', this.search)
      console.log('NAME', this.currentEntity.name)
      if (this.search && this.search === this.currentEntity.name) {
        console.log('SEARCH SAME')
        return
      }
      this.loading = true
      if (this.currentPermission && this.currentPermission.type === 'organization') {
        this.users = []
        if (!this.search || this.search.length < 3) this.organizations = []
        else this.organizations = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations', {params: {q: this.search}})).results
      } else {
        this.organizations = []
        if (!this.search || this.search.length < 3) this.users = []
        else this.users = (await this.$axios.$get(this.env.directoryUrl + '/api/users', {params: {q: this.search}})).results
      }

      this.loading = false
    }
  },
  async mounted() {
    this.permissions = await this.$axios.$get(this.resourceUrl + '/permissions')
  },
  methods: {
    async save() {
      if (this.addPermissions) this.permissions.push((this.currentPermission))
      try {
        this.permissions.forEach(permission => {
          if (!permission.type) delete permission.type
          if (!permission.id) delete permission.id
        })
        await this.$axios.$put(this.resourceUrl + '/permissions', this.permissions)
        this.addPermissions = false
        eventBus.$emit('notification', `Les permissions ont bien été mises à jour`)
      } catch (error) {
        this.permissions.pop()
        eventBus.$emit('notification', {error, msg: `Erreur pendant la mise à jour des permissions:`})
      }
    },
    removePermission(rowIndex) {
      this.permissions.splice(rowIndex, 1)
      this.save()
    },
    initPermission() {
      return {
        type: 'organization',
        id: null,
        roles: [],
        operations: [],
        classes: []
      }
    }
  }
}
</script>
