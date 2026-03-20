import type { Application, BaseApp, AppConfig } from '#api/types'
import { provide } from 'vue'
import debugModule from 'debug'

const debug = debugModule('application-store')

// we do not use SSR, so we can use a simple module level singleton
export type ApplicationStore = ReturnType<typeof createApplicationStore>
const applicationStoreKey = Symbol('application-store')

const createApplicationStore = (id: string) => {
  const applicationFetch = useFetch<Application & { userPermissions: string[] }>($apiPath + `/applications/${id}`)
  const application = ref<(Application & { userPermissions: string[] }) | null>(null)
  watch(applicationFetch.data, () => { application.value = applicationFetch.data.value })

  const baseAppDraft = computed(() => {
    if (!application.value) return null
    return (application.value.baseAppDraft && Object.keys(application.value.baseAppDraft).length)
      ? application.value.baseAppDraft
      : application.value.baseApp
  })

  const patch = async (patch: Partial<Application>) => {
    await $fetch<Application>('/applications/' + id, { method: 'PATCH', body: patch })
    if (applicationFetch.data.value) Object.assign(applicationFetch.data.value, patch)
  }

  const canWriteConfig = computed(() => application.value?.userPermissions.includes('writeConfig'))

  const configFetch = useFetch<AppConfig>($apiPath + `/applications/${id}/configuration`, { immediate: false })
  const config = ref<AppConfig | null>(null)
  watch(configFetch.data, () => { config.value = configFetch.data.value })
  const writeConfig = async (newConfig: AppConfig) => {
    debug('writeConfig', newConfig)
    await $fetch<AppConfig>('/applications/' + id + '/configuration', {
      method: 'PUT',
      body: newConfig,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    config.value = newConfig
    if (application.value) application.value.status = 'configured'
  }

  const configDraftFetch = useFetch<AppConfig>($apiPath + `/applications/${id}/configuration-draft`, { immediate: false })
  const configDraft = ref<AppConfig | null>(null)
  watch(configDraftFetch.data, () => { configDraft.value = configDraftFetch.data.value })
  const writeConfigDraft = async (newConfigDraft: AppConfig) => {
    debug('writeConfigDraft', newConfigDraft)
    await $fetch<AppConfig>('applications/' + id + '/configuration-draft', {
      method: 'PUT',
      body: newConfigDraft,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    configDraft.value = newConfigDraft
    if (application.value) {
      delete application.value.errorMessageDraft
      application.value.status = 'configured-draft'
    }
  }
  const cancelConfigDraft = async () => {
    await $fetch('applications/' + id + '/configuration-draft', { method: 'DELETE' })
    configDraft.value = config.value
    if (application.value) application.value.status = 'configured'
  }

  const baseAppFetch = useFetch<BaseApp>($apiPath + `/applications/${id}/base-application`, { immediate: false })
  const privateAccess = computed(() => application.value && `${application.value.owner.type}:${application.value.owner.id}`)
  const baseAppsParams = computed(() => ({
    privateAccess: privateAccess.value,
    size: 10000,
    applicationName: baseAppFetch.data.value?.applicationName
  }))
  const baseAppsFetch = useFetch<{ results: BaseApp[] }>(() => baseAppsParams.value.privateAccess && baseAppsParams.value.applicationName && `${$apiPath}/base-applications`, { query: baseAppsParams, immediate: false })

  const session = useSessionAuthenticated()
  const can = (operation: string) => {
    if (session.state.user?.adminMode) return true
    return application.value?.userPermissions?.includes(operation) ?? false
  }

  const journalFetch = useFetch<any[]>($apiPath + `/applications/${id}/journal`, { immediate: false })
  const journal = ref<any[] | null>(null)
  watch(journalFetch.data, () => { journal.value = journalFetch.data.value })

  const datasetsFetch = useFetch<{ results: any[] }>(() => {
    const conf = config.value
    const datasetsIds = ((conf?.datasets as any[]) || [])
      .map((d: any) => d.id || d.href?.split('/').pop())
      .filter(Boolean)
    if (!datasetsIds.length) return null
    return `${$apiPath}/datasets`
  }, {
    query: computed(() => {
      const conf = config.value
      const datasetsIds = ((conf?.datasets as any[]) || [])
        .map((d: any) => d.id || d.href?.split('/').pop())
        .filter(Boolean)
      return {
        id: datasetsIds.join(','),
        size: 10000,
        select: 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft,count,finalizedAt',
        sort: 'createdAt:-1'
      }
    }),
    immediate: false,
    watch: false
  })

  const childrenAppsFetch = useFetch<{ results: any[] }>(() => {
    const conf = config.value
    const appIds = ((conf?.applications as any[]) || [])
      .map((d: any) => d.id || d.href?.split('/').pop())
      .filter(Boolean)
    if (!appIds.length) return null
    return `${$apiPath}/applications`
  }, {
    query: computed(() => {
      const conf = config.value
      const appIds = ((conf?.applications as any[]) || [])
        .map((d: any) => d.id || d.href?.split('/').pop())
        .filter(Boolean)
      return {
        id: appIds.join(','),
        size: 10000,
        select: 'title,description,status,topics,errorMessage,updatedAt',
        sort: 'createdAt:-1'
      }
    }),
    immediate: false,
    watch: false
  })

  const remove = async () => {
    await $fetch('/applications/' + id, { method: 'DELETE' })
  }

  const changeOwner = async (owner: { type: string, id: string, department?: string }) => {
    await $fetch(`/applications/${id}/owner`, { method: 'PUT', body: owner })
  }

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
    baseAppDraft,
    baseAppsFetch,
    can,
    journalFetch,
    journal,
    datasetsFetch,
    childrenAppsFetch,
    remove,
    changeOwner,
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
