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
      v-if="permission"
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

        <v-autocomplete
          v-if="permission.type && (permission.type === 'organization' || user.adminMode)"
          :value="permission"
          :items="permission.type === 'organization' ? organizations : users"
          :search-input.sync="search"
          :loading="loading"
          item-text="name"
          item-value="id"
          :label="$t('name')"
          required
          cache-items
          hide-no-data
          return-object
          @change="setOrganization"
        />

        <v-text-field
          v-if="permission.type && permission.type === 'user' && !user.adminMode"
          v-model="permission.id"
          :label="$t('id')"
          required
        />

        <v-select
          v-if="permission.type === 'organization' && owner.type === 'organization' && permission.id === owner.id && owner.departments && owner.departments.length"
          v-model="permission.department"
          :items="[{value: null, text: $t('allDeps')}, ...owner.departments.map(d => ({value: d.id, text: `${d.name} (${d.id})`})), {value: '-', text: $t('noDep')}]"
          :label="$t('department')"
        />

        <v-select
          v-if="permission.type === 'organization' && owner.type === 'organization' && permission.id === owner.id && owner.roles && owner.roles.length"
          v-model="permission.roles"
          :items="owner.roles"
          :label="$t('rolesLabel')"
          multiple
        />

        <v-select
          v-model="permission.classes"
          :items="Object.keys(permissionClasses).filter(c => $te('classNames.' + c)).map(c => ({class: c, title: $t('classNames.' + c)}))"
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
          @click="showDialog = false; permission = null"
        />
        <v-btn
          v-t="'validate'"
          :disabled="(permission.type && !permission.id) || ((!permission.operations || !permission.operations.length) && (!permission.classes ||!permission.classes.length))"
          color="primary"
          @click="showDialog = false;$emit('input', permission)"
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
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    # readAdvanced: 'Lecture informations détaillées',
    # write: 'Ecriture',
    # admin: 'Administration',
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
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    # readAdvanced: 'Lecture informations détaillées',
    # write: 'Ecriture',
    # admin: 'Administration',
    use: Use the service
</i18n>

<script>
import { mapState } from 'vuex'

const allUsers = { id: '*', name: '*' }

export default {
  props: ['value', 'permissionClasses', 'owner'],
  data: () => ({
    showDialog: false,
    permission: null,
    expertMode: false,
    search: '',
    loading: false,
    users: [allUsers],
    organizations: []
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user']),
    scopeItems () {
      if (!this.owner) return []
      const items = [{ value: 'public', label: this.$t('public') }]
      if (this.owner.type === 'organization') {
        items.push({ value: 'ownerOrganization', label: this.$t('ownerOrganization') })
        if (this.owner.departments) {
          items.push({ value: 'ownerOrganizationNoDep', label: this.$t('ownerOrganizationNoDep') })
          for (const dep of this.owner.departments) {
            items.push({ value: 'ownerOrganizationDep:' + dep.id, label: this.$t('ownerOrganizationDep', { ...dep }) })
          }
        }
      }
      items.push({ value: 'organization', label: this.$t('otherOrganization') })
      return items
    },
    operations () {
      return [].concat(...Object.keys(this.permissionClasses)
        .filter(c => this.$te('classNames.' + c))
        .map(c => [{ header: this.$t('classNames.' + c) }].concat(this.permissionClasses[c])))
    }
  },
  watch: {
    value: {
      immediate: true,
      handler () {
        if (this.value) {
          this.permission = JSON.parse(JSON.stringify(this.value))
          if (this.permission.operations && this.permission.operations.length) this.expertMode = true
          if (this.permission.type === 'organization') {
            this.organizations = [this.permission]
          }
          this.permission.type = this.permission.type || null
          this.permission.id = this.permission.id || null
          this.permission.department = this.permission.department || null
        } else {
          this.permission = {
            type: 'organization',
            operations: [],
            classes: ['read', 'list']
          }
          this.setPermissionType()
        }
      }
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
    search: async function () {
      if (this.search && this.search === this.permission.name) return

      this.loading = true
      if (this.permission && this.permission.type === 'organization') {
        this.users = [allUsers]
        if (!this.search || this.search.length < 3) this.organizations = []
        else this.organizations = (await this.$axios.$get(this.env.directoryUrl + '/api/organizations', { params: { q: this.search } })).results
      } else {
        this.organizations = []
        if (!this.search || this.search.length < 3) this.users = [allUsers]
        else this.users = [allUsers].concat((await this.$axios.$get(this.env.directoryUrl + '/api/users', { params: { q: this.search } })).results)
      }

      this.loading = false
    }
  },
  methods: {
    setPermissionType () {
      if (this.permission.type === null) {
        delete this.permission.id
        delete this.permission.name
        delete this.permission.roles
      } else if (this.permission.type === 'organization') {
        if (this.owner.type === 'organization') {
          this.setOrganization(this.owner)
          this.permission.department = this.owner.department || null
        } else {
          this.permission.id = null
          this.permission.name = null
        }
        this.permission.roles = []
      }
    },
    setOrganization (org) {
      if (!org) {
        this.permission.id = null
        this.permission.name = null
        return
      }
      this.permission.id = org.id
      this.permission.name = org.name
      this.permission.department = null
      this.permission.roles = []
      this.organizations = [org]
    }
  }
}
</script>

<style>

</style>
