<template>
  <div>
    <h3 class="headline mt-3 mb-3">
      Propriétaire{{ resource.owner.type === 'organization' ? 's' : '' }}
    </h3>
    <div v-if="resource.owner.type === 'user'">
      Utilisateur <nuxt-link :to="localePath({name: 'settings-type-id', params: resource.owner})">
        {{ resource.owner.name }}
      </nuxt-link>
    </div>
    <div v-else>
      <span>Membres de l'organisation <nuxt-link :to="localePath({name: 'settings-type-id', params: resource.owner})">{{ resource.owner.name }}</nuxt-link></span>
      <span v-if="resource.owner.role"> ayant le rôle <strong>{{ resource.owner.role }}</strong><span v-if="resource.owner.role !== env.adminRole"> ou <strong>{{ env.adminRole }}</strong></span></span>
    </div>

    <h3 class="headline mt-3 mb-3">
      Permissions
    </h3>
    <v-btn
      id="new-permissions"
      color="primary"
      @click="currentPermission = initPermission();addPermissions = true;showDialog = true"
    >
      Ajouter des permissions
    </v-btn>
    <v-data-table
      v-if="permissions && permissions.length"
      :headers="[{text: 'Portée', sortable: false}, {text: 'Actions', sortable: false}, { text: '', sortable: false }]"
      :items="permissions"
      hide-default-footer
      class="elevation-1 mt-3"
    >
      <template v-slot:item="{item, index}">
        <tr>
          <td>
            <div v-if="!item.type">
              Public
            </div>
            <div v-else>
              {{ (item.type === 'user' ? 'Utilisateur ' : 'Organisation ') + item.name }}
            </div>
            <div v-if="item.type === 'organization' && (!item.roles || !item.roles.length)">
              Tout le monde
            </div>
            <div v-if="item.type === 'organization' && (item.roles && item.roles.length)">
              Restreint aux rôles : {{ item.roles.join(', ') }}
            </div>
          </td>
          <td>
            <v-list dense>
              <template v-for="(classOperations, permClass) in permissionClasses">
                <v-list-item
                  v-if="((item.classes || []).includes(permClass)) || classOperations.filter(o => (item.operations || []).includes(o.id)).length"
                  :key="permClass"
                >
                  <v-list-item-content>
                    <v-row style="width:100%">
                      <v-col cols="3">
                        {{ classNames[permClass] }}
                      </v-col>
                      <v-col cols="9">
                        <span v-if="(item.classes || []).includes(permClass)">Toutes</span>
                        <span v-else>{{ classOperations.filter(o => (item.operations || []).find(oid => o.id && o.id === oid)).map(o => o.title).join(' - ') }}</span>
                      </v-col>
                    </v-row>
                  </v-list-item-content>
                </v-list-item>
              </template>
            </v-list>
          </td>
          <td class="text-right">
            <v-btn
              flat
              icon
              color="warning"
              @click="editPermission(item);showDialog = true"
            >
              <v-icon>edit</v-icon>
            </v-btn>
            <v-btn
              flat
              icon
              color="warning"
              @click="removePermission(index)"
            >
              <v-icon>delete</v-icon>
            </v-btn>
          </td>
        </tr>
      </template>
    </v-data-table>

    <v-dialog
      v-model="showDialog"
      max-width="800"
      persistent
    >
      <v-card>
        <v-card-title>Editer un ensemble de permissions</v-card-title>
        <v-card-text>
          <v-select
            v-model="currentPermission.type"
            :items="[{value: null, label: 'Public'}, {value: 'organization', label: 'Organisation'}, {value: 'user', label: 'Utilisateur'}]"
            item-text="label"
            item-value="value"
            label="Portée"
            required
          />

          <v-autocomplete
            v-if="currentPermission.type"
            v-model="currentEntity"
            :items="currentPermission.type === 'organization' ? organizations : users"
            :search-input.sync="search"
            :loading="loading"
            item-text="name"
            item-value="id"
            label="Nom"
            required
            cache-items
            hide-no-data
            return-object
          />

          <v-select
            v-if="currentPermission.type === 'organization' && currentPermissionOrganizationRoles.length"
            v-model="currentPermission.roles"
            :items="currentPermissionOrganizationRoles"
            label="Rôles (tous si aucun coché)"
            multiple
          />

          <v-select
            v-if="!expertMode"
            v-model="currentPermission.classes"
            :items="Object.keys(permissionClasses).filter(c => classNames[c]).map(c => ({class: c, title: classNames[c]}))"
            item-text="title"
            item-value="class"
            label="Actions"
            multiple
          />

          <v-select
            v-if="expertMode"
            v-model="currentPermission.operations"
            :items="operations"
            item-text="title"
            item-value="id"
            label="Actions détaillées"
            multiple
          />

          <v-switch
            v-model="expertMode"
            color="primary"
            label="Mode expert"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showDialog = false"
          >
            Annuler
          </v-btn>
          <v-btn
            :disabled="(currentPermission.type && !currentPermission.id) || ((!currentPermission.operations || !currentPermission.operations.length) && (!currentPermission.classes ||!currentPermission.classes.length))"
            color="primary"
            @click="showDialog = false;save()"
          >
            Valider
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

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
        use: 'Utiliser le service',
      },
      expertMode: false,
      addPermissions: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      permissionClasses() {
        const classes = {
          list: [{
            id: 'list',
            title: 'Lister la ressource',
            class: 'list',
          }],
        }
        if (this.api) {
          Object.keys(this.api.paths).forEach(path => Object.keys(this.api.paths[path]).forEach(method => {
            const permClass = this.api.paths[path][method]['x-permissionClass']
            classes[permClass] = (classes[permClass] || []).concat({
              id: this.api.paths[path][method].operationId,
              title: this.api.paths[path][method].summary,
              class: permClass,
            })
          }))
        }
        return classes
      },
      operations() {
        return [].concat(...Object.keys(this.permissionClasses).filter(c => this.classNames[c]).map(c => [{ header: this.classNames[c] }].concat(this.permissionClasses[c])))
      },
    },
    watch: {
      'currentPermission.type'() {
        if (this.currentPermission.type === null) {
          delete this.currentPermission.id
          delete this.currentPermission.name
          delete this.currentPermission.roles
        } else {
          this.currentPermission.id = this.currentPermission.id || null
          this.currentPermission.roles = this.currentPermission.roles || []
        }
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
        if (this.search && this.search === this.currentEntity.name) return

        this.loading = true
        if (this.currentPermission && this.currentPermission.type === 'organization') {
          this.users = []
          if (!this.search || this.search.length < 3) this.organizations = []
          else this.organizations = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.search } })).results
        } else {
          this.organizations = []
          if (!this.search || this.search.length < 3) this.users = []
          else this.users = (await this.$axios.$get(this.env.directoryUrl + '/api/users', { params: { q: this.search } })).results
        }

        this.loading = false
      },
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
          eventBus.$emit('notification', 'Les permissions ont bien été mises à jour')
        } catch (error) {
          this.permissions.pop()
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour des permissions:' })
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
          classes: [],
        }
      },
      editPermission(permission) {
        this.currentEntity = { id: permission.id, name: permission.name }
        if (permission.type === 'organization') this.organizations = [this.currentEntity]
        if (permission.type === 'user') this.users = [this.currentEntity]
        this.currentPermission = permission
      },
    },
  }
</script>
