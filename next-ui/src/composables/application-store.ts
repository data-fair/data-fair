import { Application } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let store: ReturnType<typeof prepareApplicationStore> | undefined

const prepareApplicationStore = (id: string) => {
  const applicationFetch = useFetch<Application>($apiPath + `/applications/${id}`)
  const application = computed(() => applicationFetch.data.value)

  return { id, application, applicationFetch }
}

export const createApplicationStore = (id: string) => {
  store = prepareApplicationStore(id)
  return store
}

export const useApplicationStore = () => {
  if (!store) throw new Error('application store was not initialized')
  return store
}
