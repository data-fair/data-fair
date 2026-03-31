import type { Vocabulary } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let storeSingleton: ReturnType<typeof createStore>

function createStore () {
  const vocabulary = ref<Record<string, Vocabulary>>({})
  const vocabularyArrayData = ref<Vocabulary[]>([])

  const vocabularyArray = useAsyncAction(
    async () => {
      const result = await $fetch<Vocabulary[]>('/vocabulary', { method: 'GET' })

      result.forEach(term => {
        term.identifiers.forEach(id => { vocabulary.value[id] = term })
      })

      vocabularyArrayData.value = result
      return result
    }
  )
  vocabularyArray.execute()

  return {
    vocabulary,
    vocabularyArray: { ...vocabularyArray, data: vocabularyArrayData }
  }
}

export function useStore () {
  storeSingleton = storeSingleton ?? createStore()
  return storeSingleton
}
export default useStore
