import type { Limits } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let limitsStoreSingleton: ReturnType<typeof createLimitsStore>

function createLimitsStore () {
  const { account } = useSession()
  const limitsFetch = useFetch<Limits>(
    () => account.value && `${$apiPath}/limits/${account.value.type}/${account.value.id}`
  )

  const missingSubscription = computed(() => !!(limitsFetch.data.value?.defaults && $uiConfig.subscriptionUrl))

  return {
    limitsFetch,
    missingSubscription
  }
}

export function useLimitsStore () {
  limitsStoreSingleton = limitsStoreSingleton ?? createLimitsStore()
  return limitsStoreSingleton
}
export default useLimitsStore
