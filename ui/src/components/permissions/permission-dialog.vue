<template>
  <v-dialog
    v-model="showDialog"
    max-width="800"
    persistent
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card
      v-if="permission && showDialog"
    >
      <v-card-title>{{ t('editPermission') }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="permission.type"
          :items="permissionTypes"
          item-title="title"
          item-value="value"
          :label="t('scope')"
          required
          @update:model-value="setPermissionType"
        />

        <template v-if="permission.type === 'organization'">
          <v-select
            v-model="orgSelectType"
            :items="orgSelectTypes"
          />

          <template v-if="orgSelectType === 'ownerOrg'">
            <v-select
              v-if="owner.departments && owner.departments.length"
              v-model="permission.department"
              :items="departmentItems"
              :label="t('department')"
            />

            <v-select
              v-if="owner.roles && owner.roles.length"
              v-model="permission.roles"
              :items="owner.roles"
              :label="t('rolesLabel')"
              multiple
            />
          </template>

          <template v-if="orgSelectType === 'partner'">
            <v-select
              v-model="partner"
              :items="owner.partners"
              item-title="name"
              item-value="id"
              return-object
              :label="t('partner')"
            />
          </template>
        </template>

        <template v-if="permission.type === 'user'">
          <v-select
            v-model="userSelectType"
            :items="userSelectTypes"
          />
          <member-select
            v-if="userSelectType === 'member'"
            :model-value="member"
            :organization="owner"
            @update:model-value="member = $event"
          />
          <v-text-field
            v-if="userSelectType === 'email'"
            v-model="permission.email"
            :label="t('email')"
          />
        </template>

        <v-select
          v-model="permission.classes"
          :items="classItems"
          item-title="title"
          item-value="class"
          :label="t('actions')"
          multiple
        />

        <v-switch
          v-model="expertMode"
          color="primary"
          :label="t('expertMode')"
        />

        <v-select
          v-if="expertMode"
          v-model="permission.operations"
          :items="operations"
          item-title="title"
          item-value="id"
          :label="t('detailedActions')"
          multiple
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          @click="showDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          :disabled="!valid"
          color="primary"
          variant="flat"
          @click="emit('update:modelValue', permission as Permission); showDialog = false"
        >
          {{ t('validate') }}
        </v-btn>
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
  department: Département
  allDeps: Tous les départements
  noDep: Aucun département (organisation principale seulement)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
  amongPartners: Parmi les organisations partenaires
  partner: Partenaire
  ownerOrg: Organisation propriétaire
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    use: Utiliser le service
en:
  editPermission: Edit permissions
  public: Public
  organization: Organization
  user: User
  rolesLabel: Roles (all if none is selected)
  validate: Validate
  cancel: Cancel
  scope: Scope
  detailedActions: Detailed actions
  expertMode: Expert mode
  actions: Actions
  department: Department
  allDeps: All departments
  noDep: No department (main organization only)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designed by their email
  email: Email
  amongPartners: Among partner organizations
  partner: Partner
  ownerOrg: Owner organization
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    use: Use the service
</i18n>

<script setup lang="ts">
import MemberSelect from './member-select.vue'
import type { Permission } from '#api/types'

// Mutable working copy — allows null for fields being cleared in the UI before save
type EditablePermission = {
  type?: Permission['type'] | null
  id?: string | null
  name?: string | null
  email?: string | null
  department?: string | null
  departmentName?: string | null
  roles?: string[]
  operations?: string[]
  classes?: string[]
}

const props = defineProps<{
  modelValue?: Permission
  permissionClasses: Record<string, { id: string, title: string, class: string }[]>
  owner: { type: string, id: string, name?: string, departments?: { id: string, name: string }[], roles?: string[], partners?: { id: string, name: string }[] }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Permission]
}>()

const { t, te } = useI18n()

const showDialog = ref(false)
const permission = ref<EditablePermission | null>(null)
const expertMode = ref(false)

// --- Computed: restricted permission classes (public scope = only read/list/use) ---
const restrictedPermissionClasses = computed(() => {
  if (permission.value && !permission.value.type) {
    return ['read', 'list', 'use']
      .reduce((classes: Record<string, { id: string, title: string, class: string }[]>, c) => {
        if (props.permissionClasses[c]) classes[c] = props.permissionClasses[c]
        return classes
      }, {})
  } else {
    return props.permissionClasses
  }
})

// --- Computed: class items for the classes v-select ---
const classItems = computed(() => {
  return Object.keys(restrictedPermissionClasses.value)
    .filter(c => te('classNames.' + c))
    .map(c => ({ class: c, title: t('classNames.' + c) }))
})

// --- Computed: operations for expert mode v-select ---
const operations = computed(() => {
  const result: ({ header: string } | { id: string, title: string, class: string })[] = []
  for (const c of Object.keys(restrictedPermissionClasses.value)) {
    if (!te('classNames.' + c)) continue
    result.push({ header: t('classNames.' + c) })
    result.push(...restrictedPermissionClasses.value[c])
  }
  return result
})

// --- Computed: permission types ---
const permissionTypes = computed(() => {
  const types = [
    { value: null, title: t('public') },
    { value: 'user', title: t('user') }
  ]
  if (props.owner.type === 'organization') {
    types.push({ value: 'organization', title: t('organization') })
  }
  return types
})

// --- Computed: department items ---
const departmentItems = computed(() => {
  if (!props.owner.departments?.length) return []
  return [
    { value: null, title: t('allDeps') },
    ...props.owner.departments.map((d: any) => ({ value: d.id, title: `${d.name} (${d.id})` })),
    { value: '-', title: t('noDep') }
  ]
})

// --- Computed: user select types ---
const userSelectTypes = computed(() => {
  const types = [{ value: '*', title: t('allUsers') }]
  if (props.owner.type === 'organization') {
    types.push({ value: 'member', title: t('memberOf', { org: props.owner.name }) })
  }
  types.push({ value: 'email', title: t('userByEmail') })
  return types
})

// --- Computed get/set: userSelectType ---
const userSelectType = computed({
  get () {
    if (!permission.value) return null
    if (permission.value.id === '*') return '*'
    if (permission.value.email != null && !permission.value.id) return 'email'
    if (props.owner.type === 'organization') {
      if (permission.value.email && permission.value.id) return 'member'
      if (!permission.value.id) return 'member'
      return null
    } else {
      return 'email'
    }
  },
  set (v) {
    if (!permission.value) return
    if (v === '*') {
      permission.value.id = '*'
      delete permission.value.name
      delete permission.value.email
    }
    if (v === 'email') {
      delete permission.value.id
      delete permission.value.name
      permission.value.email = ''
    }
    if (v === 'member') {
      permission.value.id = null
      permission.value.name = null
      permission.value.email = null
    }
  }
})

// --- Computed get/set: orgSelectTypes ---
const orgSelectTypes = computed(() => {
  return [
    { value: 'ownerOrg', title: t('ownerOrg') },
    { value: 'partner', title: t('amongPartners') }
  ]
})

const orgSelectType = computed({
  get () {
    if (!permission.value || permission.value.type !== 'organization') return null
    if (permission.value.id === props.owner.id) return 'ownerOrg'
    return 'partner'
  },
  set (v) {
    if (!permission.value) return
    delete permission.value.email
    permission.value.department = null
    permission.value.roles = []
    if (v === 'ownerOrg') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    } else if (v === 'partner') {
      permission.value.id = null
      permission.value.name = null
    }
  }
})

// --- Computed get/set: partner ---
const partner = computed({
  get () {
    if (orgSelectType.value !== 'partner') return null
    if (!permission.value?.id) return null
    return props.owner.partners?.find((p) => p.id === permission.value?.id) ?? null
  },
  set (org: { id: string, name: string } | null) {
    if (!permission.value) return
    delete permission.value.email
    if (org) {
      permission.value.id = org.id
      permission.value.name = org.name
    } else {
      permission.value.id = null
      permission.value.name = null
    }
  }
})

// --- Computed get/set: member ---
const member = computed({
  get () {
    if (!permission.value || permission.value.type !== 'user') return null
    if (!permission.value.id) return null
    return { id: permission.value.id!, name: permission.value.name ?? '' }
  },
  set (user: { id: string, name: string, email?: string } | null) {
    if (!permission.value) return
    delete permission.value.department
    delete permission.value.roles
    if (user) {
      permission.value.id = user.id
      permission.value.name = user.name
      permission.value.email = user.email
    } else {
      permission.value.id = null
      permission.value.name = null
      permission.value.email = null
    }
  }
})

// --- Computed: valid ---
const valid = computed(() => {
  if (!permission.value) return false
  const p = permission.value
  if ((!p.operations || !p.operations.length) && (!p.classes || !p.classes.length)) return false
  if (p.type === 'organization' && !p.id) return false
  if (p.type === 'organization' && props.owner.type === 'organization' && p.id === props.owner.id && !((p.roles && p.roles.length) || p.department)) return false
  if (p.type === 'user' && !(p.id || p.email)) return false
  return true
})

// --- Init logic ---
function init () {
  if (!showDialog.value) {
    permission.value = null
    return
  }
  if (props.modelValue) {
    permission.value = JSON.parse(JSON.stringify(props.modelValue))
    if (permission.value!.operations && permission.value!.operations.length) expertMode.value = true
    permission.value!.type = permission.value!.type || null
    permission.value!.id = permission.value!.id || null
    permission.value!.department = permission.value!.department || null
  } else {
    permission.value = {
      type: 'organization',
      operations: [],
      classes: ['read', 'list']
    }
    if (props.owner.type === 'organization') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    }
  }
}

function setPermissionType () {
  if (!permission.value) return
  if (permission.value.type === 'organization') {
    if (props.owner.type === 'organization') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    } else {
      permission.value.id = null
      permission.value.name = null
    }
  } else if (permission.value.type === 'user') {
    member.value = null
  } else if (permission.value.type === null) {
    delete permission.value.department
    delete permission.value.roles
    delete permission.value.name
    delete permission.value.email
    delete permission.value.id
  }
}

// --- Watchers ---
watch(() => props.modelValue, () => init(), { immediate: true })
watch(showDialog, () => init())

watch(() => permission.value?.classes, (classes) => {
  if (classes && classes.includes('list') && !classes.includes('read')) {
    classes.push('read')
  }
}, { deep: true })

watch(() => permission.value?.operations, (operations) => {
  if (operations && operations.includes('list') && !operations.includes('readDescription')) {
    operations.push('readDescription')
  }
}, { deep: true })

watch(restrictedPermissionClasses, () => {
  if (permission.value?.classes?.length) {
    permission.value.classes = permission.value.classes.filter((c: string) => !!restrictedPermissionClasses.value[c])
  }
})
</script>
