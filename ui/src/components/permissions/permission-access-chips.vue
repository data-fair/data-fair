<template>
  <div class="d-flex flex-wrap ga-1 mt-1">
    <v-chip
      v-for="level in levels"
      :key="level"
      size="small"
      color="primary"
      variant="tonal"
    >
      {{ level }}
    </v-chip>
    <v-chip
      v-for="(source, i) in sources"
      :key="'source-' + i"
      size="small"
      variant="outlined"
    >
      {{ sourceLabel(source) }}
    </v-chip>
  </div>
</template>

<i18n lang="yaml">
fr:
  allRights: Tous les droits
  specificOperations: Opérations spécifiques
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
  sources:
    public: Permission publique
    connected: Ouvert à tout compte connecté
    user: Permission nominative
    email: Permission par email
    ownerAdmin: Administrateur de l'organisation propriétaire
    personalAccount: Propriétaire du compte personnel
    group: Via le groupe {details}
    organization: Via l'organisation partenaire {name}
  allRoles: tous les rôles
  allDepartments: tous les départements
en:
  allRights: All rights
  specificOperations: Specific operations
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
  sources:
    public: Public permission
    connected: Open to any logged in account
    user: Named permission
    email: Permission by email
    ownerAdmin: Admin of the owner organization
    personalAccount: Owner of the personal account
    group: Through the group {details}
    organization: Through the partner organization {name}
  allRoles: all roles
  allDepartments: all departments
</i18n>

<script setup lang="ts">
import { accessClasses, type AccessSource } from '@data-fair/data-fair-shared/permissions/effective-access.ts'

const props = defineProps<{
  sources: AccessSource[]
  /** the audited account, to tell "my own group" from "a partner organization" */
  accountId: string
}>()

const { t, te } = useI18n()

const levels = computed(() => {
  const classes = accessClasses(props.sources)
  if (classes === '*') return [t('allRights')]
  const labels = classes.filter(cl => te('classNames.' + cl)).map(cl => t('classNames.' + cl))
  // a permission may grant precise operations without any class
  if (!labels.length && props.sources.some(s => s.operations.length)) return [t('specificOperations')]
  return labels
})

const sourceLabel = (source: AccessSource) => {
  if (source.kind !== 'organization') return t('sources.' + source.kind)
  // a permission on the audited account is one of its groups; on another organization it
  // is a partner, and then the organization's name is what identifies it
  if (source.organizationId !== props.accountId) {
    return t('sources.organization', { name: source.organizationName ?? source.organizationId })
  }
  const roles = source.roles?.length ? source.roles.join(', ') : t('allRoles')
  const department = source.department ? ` · ${source.department}` : ` · ${t('allDepartments')}`
  return t('sources.group', { details: roles + department })
}
</script>
