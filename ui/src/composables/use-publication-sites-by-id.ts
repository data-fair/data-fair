import { ref, watch, computed } from 'vue'
import type { PublicationSite } from '#api/types'

// shared by every card of a list: the account's publication sites (all departments) are fetched once, keyed "type:id"
const sitesById = ref<Record<string, PublicationSite>>({})
let loadedPath: string | null = null

export function usePublicationSitesById () {
  const session = useSession()
  const path = computed(() => {
    const a = session.account.value
    return a ? `settings/${a.type}/${a.id}:*/publication-sites` : null
  })
  watch(path, async (p) => {
    if (!p || p === loadedPath) return
    loadedPath = p
    try {
      const sites = await $fetch<PublicationSite[]>(p)
      sitesById.value = Object.fromEntries(sites.map(site => [`${site.type}:${site.id}`, site]))
    } catch {
      // the cards only lose their site lines, retry on the next mount
      loadedPath = null
    }
  }, { immediate: true })
  return sitesById
}
