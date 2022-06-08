<template>
  <div>
    <p v-t="'description'" />

    <div
      id="dataset-privacy"
      style="width:400px"
    >
      <v-switch
        :value="isPublic"
        :disabled="(hasPublicDeps && isPublic) || (hasPrivateParents && !isPublic)"
        :label="$t('publicAccess')"
        hide-details
        @change="switchPublic"
      />
    </div>
    <v-tooltip
      v-if="hasPublicDeps && isPublic"
      right
      activator="#dataset-privacy"
    >
      <span v-t="'warningPrivateDataset'" />
    </v-tooltip>
    <v-tooltip
      v-if="hasPrivateParents && !isPublic"
      right
      activator="#dataset-privacy"
    >
      <span v-t="'warningPublicApp'" />
    </v-tooltip>

    <v-switch
      v-if="resource.owner.type === 'organization'"
      :disabled="isPublic"
      :value="isSharedInOrga || isPublic"
      :label="$t('sharedInOrga')"
      hide-details
      @change="switchSharedInOrga"
    />

    <v-switch
      v-if="resource.owner.type === 'organization' && resource.owner.department"
      :disabled="isPublic || isSharedInOrga"
      :value="isSharedInDep || isSharedInOrga || isPublic"
      :label="$t('sharedInDep')"
      hide-details
      @change="switchSharedInDep"
    />

    <v-btn
      v-if="user.adminMode"
      id="new-permissions"
      v-t="'addPermission'"
      color="primary"
      @click="currentPermission = initPermission();addPermissions = true;showDialog = true"
    />
    <v-data-table
      v-if="permissions && permissions.length"
      :headers="[{text: 'Portée', sortable: false}, {text: 'Actions', sortable: false}, { text: '', sortable: false }]"
      :items="permissions"
      hide-default-footer
      class="elevation-1 mt-3"
    >
      <template #item="{item, index}">
        <tr>
          <td>
            <div
              v-if="!item.type"
              v-t="'public'"
            />
            <div
              v-if="item.type === 'user'"
              v-t="{path: 'userName', args: {name: item.name}}"
            />
            <div
              v-if="item.type === 'organization' && !item.department"
              v-t="{path: 'organizationName', args: {name: item.name}}"
            />
            <div
              v-if="item.type === 'organization' && item.department"
              v-t="{path: 'organizationName', args: {name: item.name + ' / ' + item.department}}"
            />
            <div
              v-if="item.type === 'organization' && (!item.roles || !item.roles.length)"
              v-t="'allRoles'"
            />
            <div
              v-if="item.type === 'organization' && (item.roles && item.roles.length)"
              v-t="{path: 'restrictedRoles', args: {roles: item.roles.join(', ')}}"
            />
          </td>
          <td>
            <v-list
              dense
              class="pa-0"
              style="background: transparent"
            >
              <template v-for="(classOperations, permClass) in permissionClasses">
                <v-list-item
                  v-if="((item.classes || []).includes(permClass)) || classOperations.filter(o => (item.operations || []).includes(o.id)).length"
                  :key="permClass"
                  class="pa-0"
                >
                  <v-list-item-content>
                    <v-row style="width:100%">
                      <v-col
                        cols="3"
                        class="py-0"
                      >
                        {{ classNames[permClass] }}
                      </v-col>
                      <v-col
                        cols="9"
                        class="py-0"
                      >
                        <span v-if="(item.classes || []).includes(permClass)" />
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
              v-if="user.adminMode"
              icon
              color="warning"
              @click="editPermission(item, index);showDialog = true"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn
              v-if="user.adminMode"
              icon
              color="warning"
              @click="removePermission(index)"
            >
              <v-icon>mdi-delete</v-icon>
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
      <v-card outlined>
        <v-card-title v-t="'editPermission'" />
        <v-card-text>
          <v-select
            v-model="currentPermission.type"
            :items="[{value: null, label: 'Public'}, {value: 'organization', label: $t('organization')}, {value: 'user', label: $t('user')}]"
            item-text="label"
            item-value="value"
            :label="$t('scope')"
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
            :label="$t('name')"
            required
            cache-items
            hide-no-data
            return-object
          />

          <v-select
            v-if="currentPermission.type === 'organization' && currentPermissionOrganizationRoles.length"
            v-model="currentPermission.roles"
            :items="currentPermissionOrganizationRoles"
            :label="$t('rolesLabel')"
            multiple
          />

          <v-select
            v-model="currentPermission.classes"
            :items="Object.keys(permissionClasses).filter(c => classNames[c]).map(c => ({class: c, title: classNames[c]}))"
            item-text="title"
            item-value="class"
            :label="$t('actions')"
            multiple
          />

          <v-switch
            v-model="expertMode"
            color="primary"
            :label="$t('expertMode')"
          />

          <v-select
            v-if="expertMode"
            v-model="currentPermission.operations"
            :items="operations"
            item-text="title"
            item-value="id"
            :label="$t('detailedActions')"
            multiple
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            v-t="'cancel'"
            text
            @click="showDialog = false"
          />
          <v-btn
            v-t="'validate'"
            :disabled="(currentPermission.type && !currentPermission.id) || ((!currentPermission.operations || !currentPermission.operations.length) && (!currentPermission.classes ||!currentPermission.classes.length))"
            color="primary"
            @click="showDialog = false;save()"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<i18n lang="yaml">
fr:
  description: Permettez à d'autres utilisateurs d'utiliser cette ressource.
  publicAccess: Accessible publiquement
  sharedInOrga: Accessible à tous les utilisateurs de l'organisation
  sharedInDep: Accessible à tous les utilisateurs du département
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des visualisations publiques.
  warningPublicApp: Vous ne devriez pas rendre cette application publique tant qu'elle utilise des sources de données privées.
  addPermission: Ajouter des permissions
  editPermission: Éditer des permissions
  public: Public
  organization: Organisation
  user: Utilisateur
  organizationName: Organisation {name}
  userName: Utilisateur {name}
  rolesLabel: Rôles (tous si aucun coché)
  allRoles: Tous les rôles
  restrictedRoles: 'Restreint aux rôles : {roles}'
  validate: Valider
  cancel: Annuler
  scope: Portée
  detailedActions: Actions détaillées
  expertMode: Mode expert
  actions: Actions
  name: Nom
  updateError: Erreur pendant la mise à jour des permissions
  permissionsUpdated: Les permissions ont été mises à jour
en:
  description: Allow other users to use this resource.
  publicAccess: Publicly accessible
  sharedInOrga: Accessible to all users of the organization
  sharedInDep: Accessible to all users of the department
  warningPrivateDataset: You should not make this dataset private as long as it is used in public visualizations.
  warningPublicApp: You should not make this visualization public as long as it uses private datasets.
  addPermission: Add permissions
  editPermission: Edit permissions
  public: Public
  organization: Organization
  user: User
  organizationName: Organization {name}
  userName: User {name}
  rolesLabel: Roles (all if none is selected)
  allRoles: All roles
  restrictedRoles: 'Restricted to roles : {roles}'
  validate: Validate
  cancel: Annuler
  scope: Scope
  detailedActions: Detailed actions
  expertMode: Expert mode
  actions: Actions
  name: Name
  updateError: Error while updating permissions
  permisisons: Permissions were updated
</i18n>

<script>
import { mapState } from 'vuex'
import eventBus from '~/event-bus'

export default {
  props: ['resource', 'resourceUrl', 'api', 'hasPublicDeps', 'hasPrivateParents'],
  data: () => ({
    permissions: [],
    currentPermission: {},
    currentPermissionIdx: {},
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
      // readAdvanced: 'Lecture informations détaillées',
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
    permissionClasses () {
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
    operations () {
      return [].concat(...Object.keys(this.permissionClasses).filter(c => this.classNames[c]).map(c => [{ header: this.classNames[c] }].concat(this.permissionClasses[c])))
    },
    isPublic () {
      return !!this.permissions.find(p => this.isPublicPermission(p))
    },
    isSharedInOrga () {
      return !!this.permissions.find(p => this.isSharedInOrgaPermission(p))
    },
    isSharedInDep () {
      return !!this.permissions.find(p => this.isSharedInDepPermission(p))
    }
  },
  watch: {
    'currentPermission.type' () {
      if (this.currentPermission.type === null) {
        delete this.currentPermission.id
        delete this.currentPermission.name
        delete this.currentPermission.roles
      } else {
        this.currentPermission.id = this.currentPermission.id || null
        this.currentPermission.roles = this.currentPermission.roles || []
      }
    },
    'currentEntity.id': async function (id) {
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
    'currentPermission.classes' (classes) {
      if (classes && classes.includes('list') && !classes.includes('read')) {
        classes.push('read')
      }
    },
    'currentPermission.operations' (operations) {
      if (operations && operations.includes('list') && !operations.includes('readDescription')) {
        operations.push('readDescription')
      }
    },
    search: async function () {
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
    }
  },
  async mounted () {
    const permissions = await this.$axios.$get(this.resourceUrl + '/permissions')
    permissions.forEach(p => {
      if (!p.type) p.type = null
    })
    this.permissions = permissions
  },
  methods: {
    isPublicPermission (p) {
      return !p.type && p.classes && p.classes.includes('read') && p.classes.includes('list')
    },
    isSharedInOrgaPermission (p) {
      return p.type === 'organization' && p.id === this.resource.owner.id && !p.department && p.classes && p.classes.includes('read') && p.classes.includes('list')
    },
    isSharedInDepPermission (p) {
      return p.type === 'organization' && p.id === this.resource.owner.id && p.department && p.classes && p.classes.includes('read') && p.classes.includes('list')
    },
    async switchPublic () {
      if (this.isPublic) {
        this.addPermissions = false
        this.currentPermission = {}
        this.permissions = this.permissions.filter(p => !this.isPublicPermission(p))
      } else {
        this.addPermissions = true
        this.permissions = this.permissions.filter(p => !this.isSharedInOrgaPermission(p) && !this.isSharedInDepPermission(p))
        this.currentPermission = { operations: [], classes: ['read', 'list'] }
      }
      this.save()
    },
    async switchSharedInOrga () {
      if (this.isSharedInOrga) {
        this.addPermissions = false
        this.currentPermission = {}
        this.permissions = this.permissions.filter(p => !this.isSharedInOrgaPermission(p))
      } else {
        this.addPermissions = true
        this.permissions = this.permissions.filter(p => !this.isSharedInDepPermission(p))
        this.currentPermission = { type: 'organization', id: this.resource.owner.id, name: this.resource.owner.name, operations: [], classes: ['read', 'list'] }
      }
      this.save()
    },
    async switchSharedInDep () {
      if (this.isSharedInDep) {
        this.addPermissions = false
        this.currentPermission = {}
        this.permissions = this.permissions.filter(p => !this.isSharedInDepPermission(p))
      } else {
        this.addPermissions = true
        this.currentPermission = { type: 'organization', id: this.resource.owner.id, name: this.resource.owner.name, department: this.resource.owner.department, operations: [], classes: ['read', 'list'] }
      }
      this.save()
    },
    async save () {
      if (this.addPermissions) this.permissions.push((this.currentPermission))
      else if (this.currentPermission) this.permissions[this.currentPermissionIdx] = this.currentPermission
      try {
        const permissions = JSON.parse(JSON.stringify(this.permissions))
        permissions.forEach(permission => {
          if (!permission.type) delete permission.type
          if (!permission.id) delete permission.id
        })
        await this.$axios.$put(this.resourceUrl + '/permissions', permissions)
        this.addPermissions = false
        eventBus.$emit('notification', this.$t('permissionsUpdated'))
      } catch (error) {
        this.permissions.pop()
        eventBus.$emit('notification', { error, msg: this.$t('updateError') })
      }
    },
    removePermission (rowIndex) {
      this.permissions.splice(rowIndex, 1)
      this.save()
    },
    initPermission () {
      return {
        type: 'organization',
        id: null,
        roles: [],
        operations: [],
        classes: []
      }
    },
    editPermission (permission, idx) {
      this.currentEntity = { id: permission.id, name: permission.name }
      if (permission.type === 'organization') this.organizations = [this.currentEntity]
      if (permission.type === 'user') this.users = [this.currentEntity]
      this.currentPermissionIdx = idx
      this.currentPermission = JSON.parse(JSON.stringify(permission))
      if (this.currentPermission.operations && this.currentPermission.operations.length) this.expertMode = true
    }
  }
}
</script>
