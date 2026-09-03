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
              v-model="departments"
              :items="departmentItems"
              :label="t('department')"
              multiple
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
              v-model="partners"
              :items="owner.partners"
              item-title="name"
              item-value="id"
              return-object
              multiple
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

        <v-select
          v-model="detailedModel"
          :items="detailedItems"
          item-title="title"
          item-value="id"
          :label="t('detailedActions')"
          :hint="t('detailedHint')"
          persistent-hint
          multiple
        >
          <!-- class-implied operations render checked and disabled without being
            stored, so the field's value stays exactly what is granted on its own -->
          <template #item="{ props: itemProps, item }">
            <v-list-item
              v-bind="itemProps"
              role="option"
            >
              <template #prepend="{ isSelected }">
                <v-checkbox-btn
                  :model-value="isSelected || coveredOpIds.has(item.id)"
                  :ripple="false"
                  tabindex="-1"
                  aria-hidden="true"
                  @click.prevent
                />
              </template>
            </v-list-item>
          </template>
        </v-select>
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
          @click="submit"
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
  detailedHint: Les actions cochées et grisées sont déjà accordées par les classes ci-dessus.
  actions: Classes d'actions
  department: Départements
  allDeps: Tous les départements
  noDep: Aucun département (organisation principale seulement)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
  amongPartners: Parmi les organisations partenaires
  partner: Partenaires
  ownerOrg: Organisation propriétaire
  otherActions: Autres actions
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
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
  detailedHint: Checked and greyed-out actions are already granted by the classes above.
  actions: Action classes
  department: Departments
  allDeps: All departments
  noDep: No department (main organization only)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designed by their email
  email: Email
  amongPartners: Among partner organizations
  partner: Partners
  ownerOrg: Owner organization
  otherActions: Other actions
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
</i18n>

<script setup lang="ts">
import MemberSelect from './member-select.vue'
import type { Permission } from '#api/types'
import { operations as allOperations } from '@data-fair/data-fair-shared/permissions/operations.ts'

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
  permissionClasses: Record<string, { id: string, title: string }[]>
  resourceType: 'datasets' | 'applications'
  owner: { type: string, id: string, name?: string, departments?: { id: string, name: string }[], roles?: string[], partners?: { id: string, name: string }[] }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Permission[]]
}>()

const { t, te, locale } = useI18n()

const showDialog = ref(false)
const permission = ref<EditablePermission | null>(null)
// multi-selects producing one permission per selected department / partner
const departments = ref<(string | null)[]>([null])
const partners = ref<{ id: string, name: string }[]>([])

// --- Computed: restricted permission classes (public scope = only read/list/use) ---
const restrictedPermissionClasses = computed(() => {
  if (permission.value && !permission.value.type) {
    return ['read', 'list', 'use']
      .reduce((classes: Record<string, { id: string, title: string }[]>, c) => {
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

// --- Full operation lookup (all descriptors, any applicability) ---
// Resolves the proper label + natural class of stored operations that are not
// part of the applicable choices (e.g. writeData kept on a dataset converted
// from file to REST) so they render with a label instead of a raw id.
const fullOpsById = computed<Record<string, { id: string, title: string, class: string }>>(() => {
  const map: Record<string, { id: string, title: string, class: string }> = {}
  for (const op of allOperations) {
    if (op.resourceType !== props.resourceType) continue
    if (map[op.id]) continue
    map[op.id] = { id: op.id, title: op.title ? (op.title[locale.value as 'fr' | 'en'] ?? op.id) : op.id, class: op.class }
  }
  return map
})

// --- Computed: operations for the detailed v-select ---
// Visual-only union: applicable operations + orphan operations (stored but not
// applicable). Entries already granted by a selected class render checked and
// disabled (like the department picker greys out individual departments when
// "all" is checked) without being duplicated into the stored operations array.
type DetailedItem = { type: 'subheader', title: string } | { id: string, title: string, props?: { disabled: boolean } }
const detailedItems = computed<DetailedItem[]>(() => {
  const result: DetailedItem[] = []
  const selectedClasses = new Set(permission.value?.classes ?? [])
  const applicableIds = new Set<string>()
  for (const ops of Object.values(restrictedPermissionClasses.value)) {
    for (const o of ops) applicableIds.add(o.id)
  }
  const orphans = (permission.value?.operations ?? []).filter((id) => !applicableIds.has(id))
  const orphansByClass: Record<string, string[]> = {}
  for (const id of orphans) {
    const c = fullOpsById.value[id]?.class ?? '_unknown'
    ;(orphansByClass[c] ||= []).push(id)
  }
  const shown = new Set<string>()
  for (const c of Object.keys(restrictedPermissionClasses.value)) {
    if (!te('classNames.' + c)) continue
    shown.add(c)
    result.push({ type: 'subheader', title: t('classNames.' + c) })
    const disabled = selectedClasses.has(c)
    for (const o of restrictedPermissionClasses.value[c]) {
      result.push({ id: o.id, title: o.title, props: { disabled } })
    }
    for (const oid of orphansByClass[c] ?? []) {
      result.push({ id: oid, title: fullOpsById.value[oid]?.title ?? oid, props: { disabled } })
    }
  }
  // orphan groups whose class has no visible section (filtered-out class,
  // public scope, pseudo-class or fully unknown id): extra section so the
  // entry stays labelled and removable — unchecking it makes it disappear.
  for (const [c, ids] of Object.entries(orphansByClass)) {
    if (shown.has(c)) continue
    result.push({ type: 'subheader', title: te('classNames.' + c) ? t('classNames.' + c) : t('otherActions') })
    const disabled = selectedClasses.has(c)
    for (const oid of ids) {
      result.push({ id: oid, title: fullOpsById.value[oid]?.title ?? oid, props: { disabled } })
    }
  }
  return result
})

// Operations implied by the selected classes (applicable entries + orphans of
// the same natural class). Shown checked but kept out of the stored array.
const coveredOpIds = computed<Set<string>>(() => {
  const covered = new Set<string>()
  const selectedClasses = new Set(permission.value?.classes ?? [])
  for (const c of selectedClasses) {
    for (const o of restrictedPermissionClasses.value[c] ?? []) covered.add(o.id)
  }
  for (const id of permission.value?.operations ?? []) {
    const natural = fullOpsById.value[id]?.class
    if (natural && selectedClasses.has(natural)) covered.add(id)
  }
  return covered
})

// v-model of the detailed select: the stored operations, nothing else — the
// class-implied ones are ticked by the #item slot, never added to the value.
const detailedModel = computed({
  get: (): string[] => permission.value?.operations ?? [],
  set (v: string[]) {
    if (permission.value) permission.value.operations = v
  }
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
  // 'all departments' and 'no department' are exclusive with each other and with the department list:
  // checking one greys out the rest instead of silently unchecking it
  const all = departments.value.includes(null)
  const none = departments.value.includes('-')
  const specific = departments.value.some(d => d !== null && d !== '-')
  return [
    { value: null, title: t('allDeps'), props: { disabled: none || specific } },
    { value: '-', title: t('noDep'), props: { disabled: all || specific } },
    { type: 'divider' },
    ...props.owner.departments.map((d: any) => ({ value: d.id, title: `${d.name} (${d.id})`, props: { disabled: all || none } }))
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
    departments.value = [null]
    partners.value = []
    if (v === 'ownerOrg') {
      permission.value.id = props.owner.id
      permission.value.name = props.owner.name
    } else if (v === 'partner') {
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
  if (p.type === 'organization') {
    if (orgSelectType.value === 'partner') {
      if (!partners.value.length) return false
    } else if (!p.id) return false
  }
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
  departments.value = [permission.value!.department ?? null]
  partners.value = permission.value!.type === 'organization' && permission.value!.id && permission.value!.id !== props.owner.id
    ? [{ id: permission.value!.id, name: permission.value!.name ?? '' }]
    : []
}

// one permission per selected department / partner
function submit () {
  const p = permission.value!
  // drop operations already granted by the selected classes (same natural
  // class): avoids storing a right twice, once as class and once as operation
  if (p.operations?.length && p.classes?.length) {
    const selectedClasses = new Set(p.classes)
    p.operations = p.operations.filter((id) => {
      const natural = fullOpsById.value[id]?.class
      return !(natural && selectedClasses.has(natural))
    })
  }
  const clone = () => JSON.parse(JSON.stringify(p)) as EditablePermission
  let permissions: EditablePermission[]
  if (p.type === 'organization' && orgSelectType.value === 'partner') {
    permissions = partners.value.map(org => ({ ...clone(), id: org.id, name: org.name }))
  } else if (p.type === 'organization' && orgSelectType.value === 'ownerOrg') {
    permissions = (departments.value.length ? departments.value : [null])
      .map(department => ({ ...clone(), department }))
  } else {
    permissions = [p]
  }
  emit('update:modelValue', permissions as Permission[])
  showDialog.value = false
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
