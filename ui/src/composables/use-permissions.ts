// ui/src/composables/use-permissions.ts
import { computed } from 'vue'
import { $uiConfig, $apiPath } from '~/context'

// Uses useSession() (not useSessionAuthenticated()) so this composable can be
// called unconditionally from pages accessible by unauthenticated users (e.g. index.vue).
// All computeds return false when account is null.
export function usePermissions () {
  const { account, accountRole } = useSession()

  const canContribDep = computed(() => {
    if (!account.value) return false
    if (account.value.type === 'user') return true
    const role = accountRole.value
    return role === $uiConfig.adminRole || role === $uiConfig.contribRole
  })

  const canContrib = computed(() => canContribDep.value && !account.value?.department)

  const canAdminDep = computed(() => {
    if (!account.value) return false
    if (account.value.type === 'user') return true
    return accountRole.value === $uiConfig.adminRole
  })

  const canAdmin = computed(() => canAdminDep.value && !account.value?.department)

  const limitsUrl = computed(() => {
    if (!account.value) return null
    return `${$apiPath}/limits/${account.value.type}/${account.value.id}`
  })

  const limitsFetch = useFetch<any>(limitsUrl)

  const missingSubscription = computed(() => {
    return !!(limitsFetch.data.value?.defaults && $uiConfig.subscriptionUrl)
  })

  return { canContribDep, canContrib, canAdminDep, canAdmin, missingSubscription }
}
