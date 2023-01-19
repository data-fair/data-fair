<template>
  <div>
    <p v-t="'description'" />

    <tutorial-alert
      v-if="resource.owner.department"
      id="permissions-deps"
      :text="$t('readDepPermissionsDoc')"
      href="https://data-fair.github.io/3/user-guide-backoffice/department"
    />

    <v-progress-linear
      v-if="!permissions"
      indeterminate
    />
    <template v-else>
      <v-alert
        v-if="hasPrivateParents && !isPublic"
        right
        dense
        type="warning"
        outlined
      >
        <span v-t="'warningPublicApp'" />
      </v-alert>
      <v-alert
        v-if="hasPublicDeps && isPublic"
        right
        dense
        type="warning"
        outlined
      >
        <span v-t="'warningPrivateDataset'" />
      </v-alert>

      <v-select
        v-model="visibility"
        :disabled="disabled"
        :items="visibilityItems"
        :label="$t('visibilityLabel')"
        outlined
        dense
        style="max-width: 800px;"
        hide-details
      />

      <v-select
        v-if="resource.owner.type === 'organization'"
        v-model="contribProfile"
        :disabled="disabled"
        :items="contribProfileItems"
        :label="$t('contribProfileLabel')"
        outlined
        dense
        style="max-width: 800px;"
        hide-details
        class="mt-4"
      />

      <v-switch
        v-if="resource.rest && resource.rest.lineOwnership"
        v-model="allUsersManageOwnLines"
        color="primary"
        :label="$t('allUsersManageOwnLines')"
        hide-details
      />

      <v-switch
        v-if="!simple && api"
        v-model="detailedMode"
        color="primary"
        :label="$t('detailedMode')"
      />
    </template>

    <template v-if="detailedMode && ownerDetails && api">
      <permission-dialog
        v-if="!disabled"
        :permission-classes="permissionClasses"
        :owner="ownerDetails"
        @input="p=> {permissions.push(p); save()}"
      >
        <template #activator="{on, attrs}">
          <v-btn
            v-t="'addPermission'"
            color="primary"
            v-bind="attrs"
            v-on="on"
          />
        </template>
      </permission-dialog>
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
                v-t="{path: 'userName', args: {name: item.name || item.id}}"
              />
              <div
                v-if="item.type === 'organization' && !item.department"
                v-t="{path: 'organizationName', args: {name: item.name}}"
              />
              <div
                v-if="item.type === 'organization' && item.department && item.department !== '-'"
                v-t="{path: 'organizationName', args: {name: item.name + ' / ' + item.department}}"
              />
              <div
                v-if="item.type === 'organization' && item.department && item.department === '-'"
                v-t="{path: 'organizationName', args: {name: item.name + ' / ' + $t('noDep')}}"
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
                class="py-1"
                style="background: transparent"
              >
                <template v-for="(classOperations, permClass) in permissionClasses">
                  <v-list-item
                    v-if="((item.classes || []).includes(permClass)) || classOperations.filter(o => (item.operations || []).includes(o.id)).length"
                    :key="permClass"
                    class="pa-0"
                    style="min-height:25px"
                  >
                    <v-list-item-content class="pa-0">
                      {{ $t('classNames.' +permClass) }}
                      <template v-if="!(item.classes || []).includes(permClass)">({{ classOperations.filter(o => (item.operations || []).find(oid => o.id && o.id === oid)).map(o => o.title.toLowerCase().replace('.', '')).join(' - ') }})</template>
                    </v-list-item-content>
                  </v-list-item>
                </template>
              </v-list>
            </td>
            <td class="text-right">
              <permission-dialog
                v-if="!disabled"
                :value="item"
                :permission-classes="permissionClasses"
                :owner="ownerDetails"
                @input="p => {$set(permissions, index, p); save()}"
              >
                <template #activator="{on, attrs}">
                  <v-btn
                    color="primary"
                    v-bind="attrs"
                    icon
                    v-on="on"
                  >
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                </template>
              </permission-dialog>
              <v-btn
                v-if="!disabled"
                icon
                color="warning"
                @click="permissions.splice(index, 1); save()"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </td>
          </tr>
        </template>
      </v-data-table>
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  description: Permettez à d'autres utilisateurs d'utiliser cette ressource.
  visibilityLabel: Qui peut consulter cette ressource ?
  visibility:
    public: tout le monde
    privateOrg: uniquement les administrateurs de l'organisation {org}
    privateOrgContrib: les administrateurs et contributeurs de l'organisation {org}
    privateUser: uniquement l'utilisateur {user}
    sharedInOrg: tous les utilisateurs de l'organisation {org}
  contribProfileLabel: Qui peut contribuer à cette ressource ?
  contribProfile:
    adminOnly: uniquement les administrateurs de l'organisation {org}
    contribWriteData: les contributeurs de l'organisation {org} peuvent modifier uniquement les données et seulement si elles sont compatibles
    contribWriteNoBreaking: les contributeurs de l'organisation {org} peuvent tout modifier à l'exception de ce qui risquerait de provoquer une rupture de compatibilité
    contribWriteAll: les contributeurs de l'organisation {org} peuvent tout modifier et supprimer la ressource
  warningPrivateDataset: Vous ne devriez pas rendre ce jeu de données privé tant qu'il est présent dans des applications publiques.
  warningPublicApp: Vous ne devriez pas rendre cette application publique, elle utilise des sources de données privées.
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
  detailedMode: Édition détaillée des permissions
  actions: Actions
  name: Nom
  updateError: Erreur pendant la mise à jour des permissions
  permissionsUpdated: Les permissions ont été mises à jour
  noDep: aucun département
  readDepPermissionsDoc: Consultez la documentation sur les départements pour comprend les permissions des différents membres du département.
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
  allUsersManageOwnLines: Permettre à tous les utilisateurs externes de gérer leurs propres lignes à l'intérieur de ce jeu de données (usages crowd-sourcing avancés).
en:
  description: Allow other users to use this resource.
  visibilityLabel: Who can read this dataset ?
  visibility:
    public: anyone
    privateOrg: only admins of the organization {org}
    privateOrgContrib: admins and contributors of the organization {org}
    privateUser: only yourself
    sharedInOrg: any user of the organization {org}
  contribProfileLabel: Who can contribute to this resource ?
  contribProfile:
    adminOnly: only admins of the organization {org}
    contribWriteData: contribs of the organization {org} can update only the data and only if it is compatible
    contribWriteNoBreaking: contribs of the organization {org} can update anything except for what might constitute a breaking change
    contribWriteAll: contribs of the organization {org} can update anything and delete the resource
  warningPrivateDataset: You should not make this dataset private as long as it is used in public applications.
  warningPublicApp: You should not make this application public as long as it uses private datasets.
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
  detailedMode: Detailed edition of permissions
  actions: Actions
  name: Name
  updateError: Error while updating permissions
  permissionsUpdated: Permissions were updated
  noDep: no department
  readDepPermissionsDoc: Read the documentation about departments to understand the permissions applied to members of the departement and of the organization.
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
  allUsersManageOwnLines: Allow all external users to manage their own lines inside the dataset (advanced crowd-sourcing use-cases).
</i18n>

<script>
import { mapState } from 'vuex'
import eventBus from '~/event-bus'
import permissionDialog from './permission-dialog.vue'
import permissionsUtils from '~/assets/permissions-utils.js'

export default {
  components: { permissionDialog },
  props: ['resource', 'resourceUrl', 'api', 'disabled', 'hasPublicDeps', 'hasPrivateParents', 'simple'],
  data: () => ({
    permissions: null,
    currentPermission: {},
    currentPermissionIdx: {},
    showDialog: false,
    detailedMode: false,
    ownerDetails: null
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
          for (const altPermission of this.api.paths[path][method]['x-altPermissions'] || []) {
            classes[permClass] = (classes[permClass] || []).concat([altPermission])
          }
        }))
      }
      return classes
    },
    isPublic () {
      return !!this.permissions.find(p => this.isPublicPermission(p))
    },
    isSharedInOrg () {
      return !!this.permissions.find(p => this.isSharedInOrgPermission(p))
    },
    isPrivateOrgContrib () {
      return !!this.permissions.find(p => this.isPrivateOrgContribPermission(p))
    },
    visibility: {
      get () {
        if (!this.permissions) return
        if (this.isPublic) return 'public'
        if (this.isSharedInOrg) return 'sharedInOrg'
        if (this.isPrivateOrgContrib) return 'privateOrgContrib'
        if (this.resource.owner.type === 'organization') return 'privateOrg'
        return 'privateUser'
      },
      set (visibility) {
        this.permissions = this.permissions
          .filter(p => !this.isPublicPermission(p) && !this.isSharedInOrgPermission(p) && !this.isPrivateOrgContribPermission(p))

        if (visibility === 'privateUser' || visibility === 'privateOrg') {
          // nothing to do
        } else {
          this.permissions.push({ type: 'organization', id: this.resource.owner.id, name: this.resource.owner.name, roles: ['contrib'], operations: [], classes: ['list', 'read', 'readAdvanced'] })
          if (visibility === 'sharedInOrg') {
            this.permissions.push({ type: 'organization', id: this.resource.owner.id, name: this.resource.owner.name, operations: [], classes: ['list', 'read'] })
          } else if (visibility === 'public') {
            this.permissions.push({ operations: [], classes: ['list', 'read'] })
          }
        }
        this.save()
      }
    },
    visibilityLabel () {
      return this.visibility && this.$t('visibility.' + this.visibility)
    },
    visibilityItems () {
      const items = []
      const privateDisabled = this.hasPublicDeps && this.isPublic
      const i18nParams = {}
      if (this.resource.owner.type === 'organization') {
        i18nParams.org = this.resource.owner.name || this.resource.owner.id
        if (this.resource.owner.department) {
          i18nParams.dep = this.resource.owner.name || this.resource.owner.id
        }
      }
      if (this.resource.owner.type === 'organization') {
        items.push({ value: 'privateOrg', text: this.$t('visibility.privateOrg', { org: this.resource.owner.name || this.resource.owner.id }), disabled: privateDisabled })
        items.push({ value: 'privateOrgContrib', text: this.$t('visibility.privateOrgContrib', { org: this.resource.owner.name || this.resource.owner.id }), disabled: privateDisabled })
        items.push({ value: 'sharedInOrg', text: this.$t('visibility.sharedInOrg', { org: this.resource.owner.name || this.resource.owner.id }), disabled: privateDisabled })
      } else {
        items.push({ value: 'privateUser', text: this.$t('visibility.privateUser', { user: this.resource.owner.name || this.resource.owner.id }), disabled: privateDisabled })
      }
      items.push({ value: 'public', text: this.$t('visibility.public'), disabled: this.hasPrivateParents && !this.isPublic })
      return items
    },
    isContribWriteAll () {
      return !!this.permissions.find(p => this.isContribWriteAllPermission(p))
    },
    isContribWriteData () {
      return !!this.permissions.find(p => this.isContribWriteDataPermission(p))
    },
    isContribWriteNoBreaking () {
      return !!this.permissions.find(p => this.isContribWriteNoBreakingPermission(p))
    },
    contribProfile: {
      get () {
        if (!this.permissions) return
        if (this.isContribWriteAll) return 'contribWriteAll'
        if (this.isContribWriteNoBreaking) return 'contribWriteNoBreaking'
        if (this.isContribWriteData) return 'contribWriteData'
        return 'adminOnly'
      },
      set (contribProfile) {
        this.permissions = this.permissions
          .filter(p => !this.isContribWriteAllPermission(p) && !this.isContribWriteDataPermission(p) && !this.isContribWriteNoBreakingPermission(p))
        const writeDataOperations = this.resource.isRest ? ['writeData', 'createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines'] : ['writeData', 'cancelDraft']
        if (contribProfile === 'adminOnly') {
          // nothing to do
        } else if (contribProfile === 'contribWriteData') {
          this.permissions.push({ type: 'organization', id: this.resource.owner.id, department: this.resource.owner.department || '-', name: this.resource.owner.name, roles: ['contrib'], operations: writeDataOperations, classes: [] })
        } else if (contribProfile === 'contribWriteNoBreaking') {
          this.permissions.push({ type: 'organization', id: this.resource.owner.id, department: this.resource.owner.department || '-', name: this.resource.owner.name, roles: ['contrib'], operations: [...writeDataOperations, 'writeDescription', 'postMetadataAttachment', 'deleteMetadataAttachment'], classes: [] })
        } else if (contribProfile === 'contribWriteAll') {
          this.permissions.push({ type: 'organization', id: this.resource.owner.id, department: this.resource.owner.department || '-', name: this.resource.owner.name, roles: ['contrib'], operations: ['delete'], classes: ['write'] })
        }
        this.save()
      }
    },
    contribProfileLabel () {
      return this.contribProfile && this.$t('contribProfile.' + this.contribProfile)
    },
    contribProfileItems () {
      const items = [
        { value: 'adminOnly', text: this.$t('contribProfile.adminOnly', { org: this.resource.owner.name || this.resource.owner.id }) }
      ]
      if (this.permissionClasses.write.find(c => c.id === 'writeData')) {
        items.push({ value: 'contribWriteData', text: this.$t('contribProfile.contribWriteData', { org: this.resource.owner.name || this.resource.owner.id }) })
        items.push({ value: 'contribWriteNoBreaking', text: this.$t('contribProfile.contribWriteNoBreaking', { org: this.resource.owner.name || this.resource.owner.id }) })
      }
      items.push({ value: 'contribWriteAll', text: this.$t('contribProfile.contribWriteAll', { org: this.resource.owner.name || this.resource.owner.id }) })
      return items
    },
    hasDetailedPermission () {
      return !!this.permissions.find(p =>
        !this.isPublicPermission(p) &&
        !this.isSharedInOrgPermission(p) &&
        !this.isPrivateOrgContribPermission(p) &&
        !this.isManageOwnLinesPermission(p) &&
        !this.isContribWriteDataPermission(p) &&
        !this.isContribWriteNoBreakingPermission(p) &&
        !this.isContribWriteAllPermission(p)
      )
    },
    allUsersManageOwnLines: {
      get () {
        return !!this.permissions.find(p => this.isManageOwnLinesPermission(p))
      },
      set (allUsersManageOwnLines) {
        this.permissions = this.permissions
          .filter(p => !this.isManageOwnLinesPermission(p))
        if (allUsersManageOwnLines) this.permissions.push({ type: 'user', id: '*', operations: ['readSafeSchema'], classes: ['manageOwnLines'] })
        this.save()
      }
    }
  },
  watch: {
    detailedMode () {
      if (this.detailedMode && !this.ownerDetails) this.fetchOwnerDetails()
    }
  },
  async created () {
    const permissions = await this.$axios.$get(this.resourceUrl + '/permissions')
    permissions.forEach(p => {
      if (!p.type) p.type = null
    })
    this.permissions = permissions
    this.$emit('permissions', this.permissions)
    this.detailedMode = this.hasDetailedPermission
  },
  methods: {
    isInDepartmentPermission (p) {
      return permissionsUtils.isInDepartmentPermission(p, this.resource)
    },
    isPublicPermission (p) {
      return !p.type && p.classes && p.classes.includes('read') && p.classes.includes('list')
    },
    isSharedInOrgPermission (p) {
      return p.type === 'organization' && this.resource.owner.type === 'organization' &&
        p.id === this.resource.owner.id && !p.department &&
        p.classes && p.classes.includes('read') && p.classes.includes('list') && !p.roles
    },
    isPrivateOrgContribPermission (p) {
      return p.type === 'organization' && this.resource.owner.type === 'organization' &&
        p.id === this.resource.owner.id && this.isInDepartmentPermission(p) &&
        p.classes && p.classes.includes('read') && p.classes.includes('list') && p.roles && p.roles.includes('contrib')
    },
    isManageOwnLinesPermission (p) {
      return p.type === 'user' && p.id === '*' && p.classes && p.classes.includes('manageOwnLines')
    },
    isContribWriteAllPermission (p) {
      return permissionsUtils.isContribWriteAllPermission(p, this.resource)
    },
    isContribWriteDataPermission (p) {
      return p.type === 'organization' && this.resource.owner.type === 'organization' &&
        p.id === this.resource.owner.id && this.isInDepartmentPermission(p) &&
        p.roles && p.roles.length === 1 && p.roles[0] === 'contrib' &&
        p.operations && p.operations.includes('writeData') && !p.operations.includes('writeDescription')
    },
    isContribWriteNoBreakingPermission (p) {
      return p.type === 'organization' && this.resource.owner.type === 'organization' &&
        p.id === this.resource.owner.id && this.isInDepartmentPermission(p) &&
        p.roles && p.roles.length === 1 && p.roles[0] === 'contrib' &&
        p.operations && p.operations.includes('writeDescription') && !p.operations.includes('writeDescriptionBreaking')
    },
    async save () {
      const permissions = JSON.parse(JSON.stringify(this.permissions))
      permissions.forEach(permission => {
        if (!permission.type) delete permission.type
        if (!permission.id) delete permission.id
        if (!permission.department) delete permission.department
      })
      await this.$axios.$put(this.resourceUrl + '/permissions', permissions)
      this.$emit('permissions', this.permissions)
      eventBus.$emit('notification', this.$t('permissionsUpdated'))
    },
    async fetchOwnerDetails () {
      this.ownerDetails = {
        ...await this.$axios.$get(`${process.env.directoryUrl}/api/${this.resource.owner.type}s/${this.resource.owner.id}`),
        type: this.resource.owner.type
      }
    }
  }
}
</script>
