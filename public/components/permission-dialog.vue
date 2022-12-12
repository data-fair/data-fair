<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
    persistent
  >
    <template #activator="{on, attrs}">
      <slot
        name="activator"
        :attrs="attrs"
        :on="on"
      />
    </template>
    <v-card
      v-if="permission && showDialog"
      outlined
    >
      <v-card-title v-t="'editPermission'" />
      <v-card-text>
        <v-select
          v-model="permission.type"
          :items="[{value: null, label: $t('public')}, {value: 'organization', label: $t('organization')}, {value: 'user', label: $t('user')}]"
          item-text="label"
          item-value="value"
          :label="$t('scope')"
          required
          @change="setPermissionType"
        />

        <template v-if="permission.type === 'organization'">
          <organization-select
            v-model="organization"
          />
          <v-select
            v-if="owner.type === 'organization' && permission.id === owner.id && owner.departments && owner.departments.length"
            v-model="permission.department"
            :items="[{value: null, text: $t('allDeps')}, ...owner.departments.map(d => ({value: d.id, text: `${d.name} (${d.id})`})), {value: '-', text: $t('noDep')}]"
            :label="$t('department')"
          />

          <v-select
            v-if="owner.type === 'organization' && permission.id === owner.id && owner.roles && owner.roles.length"
            v-model="permission.roles"
            :items="owner.roles"
            :label="$t('rolesLabel')"
            multiple
          />
        </template>

        <template v-if="permission.type === 'user'">
          <v-select
            v-model="userSelectType"
            :items="userSelectTypes"
          />
          <member-select
            v-if="userSelectType === 'member'"
            v-model="member"
            :organization="owner"
          />
          <v-text-field
            v-if="userSelectType === 'email'"
            v-model="permission.email"
            :label="$t('email')"
          />
        </template>

        <v-select
          v-model="permission.classes"
          :items="Object.keys(restrictedPermissionClasses).filter(c => $te('classNames.' + c)).map(c => ({class: c, title: $t('classNames.' + c)}))"
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
          v-model="permission.operations"
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
          :disabled="!valid"
          color="primary"
          @click="$emit('input', permission);showDialog = false;"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  editPermission: Éditer des permissions
  public: Public
  organization: Organisation
  user: Utilisateur
  rolesLabel: Rôles (tous si aucun coché)
  validate: Valider
  cancel: Annuler
  scope: Portée
  detailedActions: Actions détaillées
  expertMode: Mode expert
  actions: Actions
  name: Nom
  id: Identifiant
  ownerOrganization: Membres de l'organisation propriétaire
  ownerOrganizationNoDep: Membres de l'organisation propriétaire hors département
  ownerOrganizationDep: Membres de l'organisation propriétaire et du département {name} ({id})
  otherOrganization: Membres d'une autre organisation
  department: Département
  allDeps: Tous les départements
  noDep: Aucun département (organisation principale seulement)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations détaillées
    write: Écriture
    # admin: Administration
    use: Utiliser le service
en:
  editPermission: Edit permissions
  public: Public
  organization: Organization
  user: User
  rolesLabel: Roles (all if none is selected)
  validate: Validate
  cancel: Annuler
  scope: Scope
  detailedActions: Detailed actions
  expertMode: Expert mode
  actions: Actions
  name: Name
  id: Id
  ownerOrganization: Members of owner organization
  ownerOrganizationNoDep: Members of owner organization outside a department
  ownerOrganizationDep: Members of owner organization in department {name} ({id})
  otherOrganization: Members of another organization
  department: Department
  allDeps: All departments
  noDep: No department (main organization only)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designed by their email
  email: Email
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    # admin: Administration
    use: Use the service
</i18n>

<script>
import { mapState } from 'vuex'

export default {
  props: ['value', 'permissionClasses', 'owner'],
  data: () => ({
    showDialog: false,
    permission: null,
    expertMode: false,
    searchUser: '',
    searchOrganization: '',
    loading: false,
    users: [],
    organizations: []
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user']),
    operations () {
      return [].concat(...Object.keys(this.restrictedPermissionClasses)
        .filter(c => this.$te('classNames.' + c))
        .map(c => [{ header: this.$t('classNames.' + c) }].concat(this.restrictedPermissionClasses[c])))
    },
    userSelectTypes () {
      const types = [{ value: '*', text: this.$t('allUsers') }]
      if (this.owner.type === 'organization') types.push({ value: 'member', text: this.$t('memberOf', { org: this.owner.name }) })
      types.push({ value: 'email', text: this.$t('userByEmail') })
      return types
    },
    userSelectType: {
      get () {
        console.log('GET')
        if (this.permission.id === '*') return '*'
        if (![null, undefined].includes(this.permission.email) && !this.permission.id) return 'email'
        if (this.owner.type === 'organization') {
          if (this.permission.email && this.permission.id) return 'member'
          if (!this.permission.id) return 'member'
          return null
        } else {
          return 'email'
        }
      },
      set (userSelectType) {
        if (userSelectType === '*') {
          this.$set(this.permission, 'id', '*')
          this.$delete(this.permission, 'name')
          this.$delete(this.permission, 'email')
        }
        if (userSelectType === 'email') {
          this.$delete(this.permission, 'id')
          this.$delete(this.permission, 'name')
          this.$set(this.permission, 'email', '')
        }
        if (userSelectType === 'member') {
          this.$set(this.permission, 'id', null)
          this.$set(this.permission, 'name', null)
          this.$set(this.permission, 'email', null)
        }
      }
    },
    organization: {
      get () {
        if (this.permission.type !== 'organization') return null
        if (!this.permission.id) return null
        return { id: this.permission.id, name: this.permission.name }
      },
      set (org) {
        this.$delete(this.permission, 'email')
        if (org) {
          this.$set(this.permission, 'id', org.id)
          this.$set(this.permission, 'name', org.name)
        } else {
          this.$set(this.permission, 'id', null)
          this.$set(this.permission, 'name', null)
        }
        this.$set(this.permission, 'department', null)
        this.$set(this.permission, 'roles', [])
      }
    },
    member: {
      get () {
        if (this.permission.type !== 'user') return null
        if (!this.permission.id) return null
        return { id: this.permission.id, name: this.permission.name }
      },
      set (user) {
        this.$delete(this.permission, 'department')
        this.$delete(this.permission, 'roles')
        if (user) {
          this.$set(this.permission, 'id', user.id)
          this.$set(this.permission, 'name', user.name)
          this.$set(this.permission, 'email', user.email)
        } else {
          this.$set(this.permission, 'id', null)
          this.$set(this.permission, 'name', null)
          this.$set(this.permission, 'email', null)
        }
      }
    },
    valid () {
      if ((!this.permission.operations || !this.permission.operations.length) && (!this.permission.classes || !this.permission.classes.length)) return false
      if (this.permission.type === 'organization' && !this.permission.id) return false
      if (this.permission.type === 'organization' && this.owner.type === 'organization' && this.permission.id === this.owner.id && !((this.permission.roles && this.permission.roles.length) || this.permission.department)) return false
      if (this.permission.type === 'user' && !(this.permission.id || this.permission.email)) return false
      return true
    },
    restrictedPermissionClasses () {
      if (this.permission && !this.permission.type) {
        return ['read', 'list', 'use']
          .reduce((classes, c) => { if (this.permissionClasses[c]) classes[c] = this.permissionClasses[c]; return classes }, {})
      } else {
        return this.permissionClasses
      }
    }
  },
  watch: {
    value: {
      immediate: true,
      handler () {
        this.init()
      }
    },
    showDialog () {
      this.init()
    },
    'permission.classes' (classes) {
      if (classes && classes.includes('list') && !classes.includes('read')) {
        classes.push('read')
      }
    },
    'permission.operations' (operations) {
      if (operations && operations.includes('list') && !operations.includes('readDescription')) {
        operations.push('readDescription')
      }
    },
    restrictedPermissionClasses () {
      if (this.permission && this.permission.classes && this.permission.classes.length) {
        this.permission.classes = this.permission.classes.filter(c => !!this.restrictedPermissionClasses[c])
      }
    }
  },
  methods: {
    init () {
      if (!this.showDialog) {
        this.permission = null
        return
      }
      if (this.value) {
        this.permission = JSON.parse(JSON.stringify(this.value))
        if (this.permission.operations && this.permission.operations.length) this.expertMode = true
        this.permission.type = this.permission.type || null
        this.permission.id = this.permission.id || null
        this.permission.department = this.permission.department || null
      } else {
        // init default permission if value is not defined
        this.permission = {
          type: 'organization',
          operations: [],
          classes: ['read', 'list']
        }
        if (this.owner.type === 'organization') {
          this.organization = this.owner
        } else {
          this.organization = null
        }
      }
    },
    setPermissionType () {
      if (this.permission.type === 'organization') {
        if (this.owner.type === 'organization') {
          this.organization = this.owner
        } else {
          this.organization = null
        }
      } else if (this.permission.type === 'user') {
        this.member = null
      } else if (this.permission.type === null) {
        this.$delete(this.permission, 'department')
        this.$delete(this.permission, 'roles')
        this.$delete(this.permission, 'name')
        this.$delete(this.permission, 'email')
        this.$delete(this.permission, 'id')
      }
    }
  }
}
</script>

<style>

</style>
