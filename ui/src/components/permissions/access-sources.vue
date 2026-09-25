<template>
  <div
    v-if="lines.length"
    class="text-caption text-medium-emphasis mt-2 px-1"
  >
    <div class="font-weight-bold">
      {{ t('grantedBy') }}
    </div>
    <div
      v-for="(line, i) in lines"
      :key="i"
    >
      {{ line }}
    </div>
  </div>
</template>

<script setup lang="ts">
type SourcePermission = {
  type?: 'user' | 'organization' | null
  id?: string | null
  name?: string
  email?: string
  department?: string | null
  departmentName?: string
  roles?: string[]
  classes?: string[]
  operations?: string[]
}

const props = defineProps<{
  sources?: { ownerRole?: string, ownerClasses: string[], permissions: SourcePermission[] }
}>()

const { t, te } = useI18n()

const grantsLabel = (classes: string[] = [], operations: string[] = []) => {
  return [
    ...classes.map(c => te('classNames.' + c) ? t('classNames.' + c) : c),
    ...operations
  ].join(', ')
}

const scopeLabel = (p: SourcePermission) => {
  if (!p.type && !p.id) return t('public')
  if (p.type === 'user') {
    if (p.id === '*') return t('connected')
    return t('user', { name: p.name || p.email || p.id })
  }
  let label = t('organization', { name: p.name || p.id })
  if (p.department === '-') label += ' / ' + t('mainOrg')
  else if (p.department && p.department !== '*') label += ' / ' + (p.departmentName || p.department)
  if (p.roles?.length) label += ' ' + t('roles', { roles: p.roles.join(', ') })
  return label
}

const lines = computed(() => {
  if (!props.sources) return []
  const result: string[] = []
  if (props.sources.ownerRole) {
    result.push(`${t('ownerRole', { role: props.sources.ownerRole })} : ${grantsLabel(props.sources.ownerClasses)}`)
  }
  for (const p of props.sources.permissions) {
    result.push(`${scopeLabel(p)} : ${grantsLabel(p.classes, p.operations)}`)
  }
  return result
})
</script>

<i18n lang="yaml">
fr:
  grantedBy: Accès accordé par
  ownerRole: Rôle {role} dans l'organisation propriétaire
  public: Permission publique
  connected: Permission pour tous les utilisateurs connectés
  user: Permission pour l'utilisateur {name}
  organization: Permission pour l'organisation {name}
  mainOrg: organisation principale
  roles: "(rôles : {roles})"
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
en:
  grantedBy: Access granted by
  ownerRole: Role {role} in the owner organization
  public: Public permission
  connected: Permission for all authenticated users
  user: Permission for the user {name}
  organization: Permission for the organization {name}
  mainOrg: main organization
  roles: "(roles: {roles})"
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
</i18n>
