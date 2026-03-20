// ui/src/composables/use-remote-services.ts
import { computed, type Ref } from 'vue'
import { withQuery } from 'ufo'

export function useRemoteServices (owner: Ref<{ type: string, id: string } | undefined>) {
  const url = computed(() => {
    if (!owner.value) return null
    return withQuery(`${$apiPath}/remote-services`, {
      size: 1000,
      privateAccess: `${owner.value.type}:${owner.value.id}`
    })
  })

  const remoteServicesFetch = useFetch<{ results: any[] }>(url)

  const remoteServices = computed(() => remoteServicesFetch.data.value?.results ?? [])

  const remoteServicesMap = computed(() => {
    const map: Record<string, { id: string, title: string, actions: Record<string, any> }> = {}
    for (const service of remoteServices.value) {
      const actions: Record<string, any> = {}
      for (const action of service.actions || []) {
        actions[action.id] = action
      }
      map[service.id] = { id: service.id, title: service.title, actions }
    }
    return map
  })

  return { remoteServices, remoteServicesMap, remoteServicesFetch }
}
