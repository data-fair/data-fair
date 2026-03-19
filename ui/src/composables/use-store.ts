import type { Vocabulary } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let storeSingleton: ReturnType<typeof createStore>

function createStore () {
  const vocabulary = ref<Record<string, Vocabulary>>({})

  const vocabularyArray = useAsyncAction(
    async () => {
      const vocabularyArray = await $fetch<Vocabulary[]>('/vocabulary', { method: 'GET' })

      vocabularyArray.forEach(term => {
        term.identifiers.forEach(id => { vocabulary.value[id] = term })
      })

      return vocabularyArray
    }
  )
  vocabularyArray.execute()

  return {
    vocabulary,
    vocabularyArray
  }
}

export function useStore () {
  storeSingleton = storeSingleton ?? createStore()
  return storeSingleton
}
export default useStore
