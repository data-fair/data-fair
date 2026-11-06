import { computed, type ComputedRef, type InjectionKey, inject, provide } from 'vue'
import { $apiPath } from '~/context'

// the bin is configured on the organization main settings, departments inherit it, users never have one
export type BinSettings = {
  active: ComputedRef<boolean>
  retentionDays: ComputedRef<number>
  refresh: () => Promise<unknown>
}

const binSettingsKey: InjectionKey<BinSettings> = Symbol('binSettings')

export function provideBinSettings (session: ReturnType<typeof useSession>): BinSettings {
  const binFetch = useFetch<{ active: boolean, retentionDays: number }>(() => {
    const account = session.account.value
    if (account?.type !== 'organization') return null
    return `${$apiPath}/settings/organization/${account.id}/bin`
  })
  const binSettings: BinSettings = {
    active: computed(() => !!binFetch.data.value?.active),
    retentionDays: computed(() => binFetch.data.value?.retentionDays ?? 30),
    refresh: () => binFetch.refresh()
  }
  provide(binSettingsKey, binSettings)
  return binSettings
}

export function useBinSettings (): BinSettings {
  return inject(binSettingsKey, {
    active: computed(() => false),
    retentionDays: computed(() => 30),
    refresh: async () => {}
  })
}
