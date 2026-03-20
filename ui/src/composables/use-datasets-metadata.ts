// ui/src/composables/use-datasets-metadata.ts
import { $apiPath } from '~/context'

const cache = new Map<string, Ref<any>>()

export const useDatasetsMetadata = (owner: Ref<{ type: string, id: string } | undefined>) => {
  const datasetsMetadata = ref<any>(null)

  watch(owner, async (o) => {
    if (!o) { datasetsMetadata.value = null; return }
    const key = `${o.type}/${o.id}`
    if (cache.has(key)) { datasetsMetadata.value = cache.get(key)!.value; return }
    const result = ref<any>(null)
    cache.set(key, result)
    try {
      result.value = await $fetch(`${$apiPath}/settings/${o.type}/${o.id}/datasets-metadata`)
      datasetsMetadata.value = result.value
    } catch {
      datasetsMetadata.value = null
    }
  }, { immediate: true })

  return { datasetsMetadata }
}
