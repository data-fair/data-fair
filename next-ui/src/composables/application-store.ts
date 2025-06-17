import type { Application, BaseApp, AppConfig } from '#api/types'
import { provide } from 'vue'

// we do not use SSR, so we can use a simple module level singleton
export type ApplicationStore = ReturnType<typeof createApplicationStore>
const applicationStoreKey = Symbol('application-store')

const createApplicationStore = (id: string) => {
  const applicationFetch = useFetch<Application & { userPermissions: string[] }>($apiPath + `/applications/${id}`)
  const application = ref<(Application & { userPermissions: string[] }) | null>(null)
  watch(applicationFetch.data, () => { application.value = applicationFetch.data.value })

  const patch = async (patch: Partial<Application>) => {
    await $fetch<Application>('/applications/' + id, { method: 'PATCH', body: patch })
    if (applicationFetch.data.value) Object.assign(applicationFetch.data.value, patch)
  }

  const canWriteConfig = computed(() => application.value?.userPermissions.includes('writeConfig'))

  const configFetch = useFetch<AppConfig>($apiPath + `/applications/${id}/configuration`, { immediate: false })
  const config = ref<AppConfig | null>(null)
  watch(configFetch.data, () => { config.value = configFetch.data.value })
  const writeConfig = async (config: AppConfig) => {
    await $fetch<AppConfig>('/applications/' + id + '/configuration', {
      method: 'PUT',
      body: config,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    config.value = config
    if (application.value) application.value.status = 'configured'
  }

  const configDraftFetch = useFetch<AppConfig>($apiPath + `/applications/${id}/configuration-draft`, { immediate: false })
  const configDraft = ref<AppConfig | null>(null)
  watch(configDraftFetch.data, () => { configDraft.value = configDraftFetch.data.value })
  const writeConfigDraft = async (config: AppConfig) => {
    await $fetch<AppConfig>('/applications/' + id + '/configuration-draft', {
      method: 'PUT',
      body: JSON.stringify(config),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    configDraft.value = config
  }
  const cancelConfigDraft = async () => {
    await $fetch('/applications/' + id + '/configuration-draft', { method: 'DELETE' })
    configDraft.value = config.value
    if (application.value) application.value.status = 'configured'
  }

  const baseAppFetch = useFetch<BaseApp>(`api/v1/applications/${id}/base-application`, { immediate: false })
  const privateAccess = computed(() => application.value && `${application.value.owner.type}:${application.value.owner.id}`)
  const baseAppsParams = computed(() => ({
    privateAccess: privateAccess.value,
    size: 10000,
    applicationName: baseAppFetch.data.value?.applicationName
  }))
  const baseAppsFetch = useFetch<{ results: BaseApp[] }>(() => baseAppsParams.value.privateAccess && baseAppsParams.value.applicationName && `${$apiPath}/base-applications`, { query: baseAppsParams, immediate: false })

  return {
    id,
    applicationLink: $siteUrl + '/data-fair/app/' + id,
    application,
    applicationFetch,
    patch,
    configFetch,
    config,
    canWriteConfig,
    writeConfig,
    configDraftFetch,
    configDraft,
    writeConfigDraft,
    cancelConfigDraft,
    baseAppFetch,
    baseAppsFetch,
  }
}

export const provideApplicationStore = (id: string) => {
  const store = createApplicationStore(id)
  provide(applicationStoreKey, store)
  return store
}

export const useApplicationStore = () => {
  const store = inject(applicationStoreKey) as ApplicationStore | undefined
  if (!store) throw new Error('application store was not initialized')
  return store
}

export default useApplicationStore
