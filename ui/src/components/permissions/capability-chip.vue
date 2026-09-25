<template>
  <v-tooltip
    v-if="tier"
    location="top"
  >
    <template #activator="{ props: tooltipProps }">
      <v-chip
        v-bind="{ ...tooltipProps, ...$attrs }"
        :color="tierColors[tier]"
        size="small"
        variant="outlined"
        :prepend-icon="mdiShieldAccountOutline"
      >
        {{ t('tier.' + tier) }}
      </v-chip>
    </template>
    <template v-if="sourceLines.length">
      <div class="font-weight-bold">
        {{ t('grantedBy') }}
      </div>
      <div
        v-for="(line, i) in sourceLines"
        :key="i"
      >
        {{ line }}
      </div>
    </template>
    <span v-else>{{ classesLabel }}</span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { mdiShieldAccountOutline } from '@mdi/js'

type SourcePermission = AccessSources['permissions'][number]

// the root element is the tooltip: forward class/style (e.g. margins set by the cards) to the chip
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  userPermissions?: string[]
  /** why the access is granted, present in the access audit mode (see permissions.accessSources) */
  accessSources?: AccessSources
}>()

const { t, te } = useI18n()

const tier = computed(() => capabilityTier(props.resourceType, props.userPermissions))

const tierColors: Record<string, string> = {
  admin: 'warning',
  write: 'primary',
  manageOwnLines: 'primary',
  read: 'success',
  list: 'default'
}

const classLabel = (c: string) => te('tier.' + c) ? t('tier.' + c) : c

const classesLabel = computed(() => {
  if (!props.userPermissions) return ''
  return grantedClasses(props.resourceType, props.userPermissions).map(classLabel).join(', ')
})

const scopeLabel = (p: SourcePermission) => {
  if (!p.type && !p.id) return t('sources.public')
  if (p.type === 'user') {
    if (p.id === '*') return t('sources.connected')
    return t('sources.user', { name: p.name || p.email || p.id })
  }
  let label = t('sources.organization', { name: p.name || p.id })
  if (p.department === '-') label += ' / ' + t('sources.mainOrg')
  else if (p.department && p.department !== '*') label += ' / ' + (p.departmentName || p.department)
  if (p.roles?.length) label += ' ' + t('sources.roles', { roles: p.roles.join(', ') })
  return label
}

const sourceLines = computed(() => {
  const sources = props.accessSources
  if (!sources) return []
  const lines: string[] = []
  if (sources.ownerRole) {
    lines.push(`${t('sources.ownerRole', { role: sources.ownerRole })} : ${sources.ownerClasses.map(classLabel).join(', ')}`)
  }
  for (const p of sources.permissions) {
    lines.push(`${scopeLabel(p)} : ${[...(p.classes ?? []).map(classLabel), ...(p.operations ?? [])].join(', ')}`)
  }
  return lines
})
</script>

<i18n lang="yaml">
fr:
  tier:
    admin: Administration
    write: Écriture
    manageOwnLines: Écriture de ses lignes
    read: Lecture
    readAdvanced: Lecture avancée
    list: Listage
    use: Utilisation
  grantedBy: Accès accordé par
  sources:
    ownerRole: Rôle {role} dans l'organisation propriétaire
    public: Permission publique
    connected: Permission pour tous les utilisateurs connectés
    user: Permission pour l'utilisateur {name}
    organization: Permission pour l'organisation {name}
    mainOrg: organisation principale
    roles: "(rôles : {roles})"
en:
  tier:
    admin: Administration
    write: Write
    manageOwnLines: Write own lines
    read: Read
    readAdvanced: Advanced read
    list: List
    use: Use
  grantedBy: Access granted by
  sources:
    ownerRole: Role {role} in the owner organization
    public: Public permission
    connected: Permission for all authenticated users
    user: Permission for the user {name}
    organization: Permission for the organization {name}
    mainOrg: main organization
    roles: "(roles: {roles})"
</i18n>
