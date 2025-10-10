export const useAccountPermissions = () => {
  const { account, accountRole } = useSession()
  const canAdminDep = computed(() => accountRole.value === $uiConfig.adminRole)
  const canAdmin = computed(() => canAdminDep.value && !account.value?.department)
  const canContribDep = computed(() => canAdminDep.value || accountRole.value === $uiConfig.contribRole)
  const canContrib = computed(() => canAdmin.value || (canContribDep.value && !account.value?.department))

  return { canAdminDep, canAdmin, canContribDep, canContrib }
}
