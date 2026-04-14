// Local enhanced copy of @data-fair/lib-vue/edit-fetch.js
// Adds createSubEdit() for per-key-subset diff/save/cancel

import { ref, watch, computed, type Ref, type ComputedRef } from 'vue'
import { ofetch } from 'ofetch'
import { useFetch, type UseFetchOptions } from '@data-fair/lib-vue/fetch.js'
import useAsyncAction, { type AsyncActionOptions } from '@data-fair/lib-vue/async-action.js'
import equal from 'fast-deep-equal'
import clone from '@data-fair/lib-utils/clone.js'

type UseEditFetchOptions = UseFetchOptions & {
  patch?: boolean
  saveOptions?: AsyncActionOptions
  fetchAfterSave?: boolean
}

type OptionalUrl = string | null | undefined

interface SubEdit<T = Record<string, any>> {
  hasDiff: ComputedRef<boolean>
  keyHasDiff: (key: keyof T) => ComputedRef<boolean>
  save: {
    execute: () => Promise<void>
    notif: Ref<any>
    loading: Ref<boolean>
    error: Ref<string | undefined>
  }
  cancel: () => void
}

export function useEditFetch<T extends Record<string, any>> (url: OptionalUrl | Ref<OptionalUrl> | (() => OptionalUrl), options: UseEditFetchOptions = {}) {
  const fetch = useFetch<T>(url, options)
  const serverData = ref<T | null>(null) as Ref<T | null>
  const data = ref<T | null>(null) as Ref<T | null>

  watch(fetch.data, () => {
    // TODO: check for local changes before overwriting ?
    serverData.value = clone(fetch.data.value)
    data.value = clone(fetch.data.value)
  })

  const hasDiff = computed(() => !equal(data.value, serverData.value))

  const getPatch = (oldData: T | null, newData: T | null): Record<string, any> | null => {
    if (!oldData || !newData) return null
    const patch: Record<string, any> = {}
    for (const key of Object.keys(newData)) {
      if (!equal(newData[key], oldData[key])) patch[key] = newData[key]
    }
    for (const key of Object.keys(oldData)) {
      if (!(key in newData)) patch[key] = null
    }
    return patch
  }

  const save = useAsyncAction(async () => {
    if (!data.value || !serverData.value || !fetch.data.value) {
      throw new Error('cannot save data that has not been fetched yet')
    }
    let res
    const dataBeforeSave = clone(data.value)
    if (options.patch) {
      const patch = getPatch(serverData.value, data.value)
      if (!patch || !Object.keys(patch).length) return
      res = await ofetch(fetch.fullUrl.value!, { method: 'PATCH', body: patch })
    } else {
      // TODO: add if-unmodified-since header ?
      res = await ofetch(fetch.fullUrl.value!, { method: 'PUT', body: data.value })
    }
    if (options.fetchAfterSave || !res) {
      fetch.refresh()
    } else {
      serverData.value = clone(res)
      // case of server-side calculated properties, updatedAt, etc
      Object.assign(data.value, getPatch(dataBeforeSave, res))
    }
  }, options.saveOptions)

  /**
   * Create a sub-editor for a subset of keys.
   * Each sub-editor has its own hasDiff, save (PATCH only its keys), and cancel.
   * This allows multiple independent edit sections on the same data object.
   */
  // Normalize values for diff comparison: treat empty arrays as equivalent to undefined/null.
  // This prevents VJSF from triggering spurious diffs when it initializes undefined array
  // fields to empty arrays on component mount.
  const normalizeForDiff = (v: any): any => {
    if (Array.isArray(v) && v.length === 0) return undefined
    return v
  }

  function createSubEdit (keys: (keyof T)[], saveOptions?: AsyncActionOptions): SubEdit<T> {
    const subHasDiff = computed(() => {
      if (!data.value || !serverData.value) return false
      return keys.some(k => !equal(normalizeForDiff(data.value![k as string]), normalizeForDiff(serverData.value![k as string])))
    })

    const keyHasDiffCache = new Map<keyof T, ComputedRef<boolean>>()
    const keyHasDiff = (key: keyof T): ComputedRef<boolean> => {
      let c = keyHasDiffCache.get(key)
      if (!c) {
        c = computed(() => {
          if (!data.value || !serverData.value) return false
          return !equal(normalizeForDiff(data.value![key as string]), normalizeForDiff(serverData.value![key as string]))
        })
        keyHasDiffCache.set(key, c)
      }
      return c
    }

    const subSave = useAsyncAction(async () => {
      if (!data.value || !serverData.value) {
        throw new Error('cannot save data that has not been fetched yet')
      }
      const d = data.value as Record<string, any>
      const sd = serverData.value as Record<string, any>
      const patch: Record<string, any> = {}
      for (const k of keys) {
        if (!equal(d[k as string], sd[k as string])) {
          patch[k as string] = d[k as string]
        }
      }
      if (!Object.keys(patch).length) return

      // Capture server state BEFORE save for post-response sync
      const serverDataBefore = clone(serverData.value) as Record<string, any>

      const res = await ofetch(fetch.fullUrl.value!, { method: 'PATCH', body: patch })
      if (res) {
        const keysSet = new Set(keys.map(k => String(k)))
        // Update serverData with full response
        for (const k of Object.keys(res)) {
          sd[k] = clone(res[k])
        }
        // Sync data from response:
        // - For keys in THIS subEdit: always update (server may add computed fields like IDs)
        // - For keys in OTHER subEdits: only update if no pending local edits
        for (const k of Object.keys(res)) {
          if (keysSet.has(k) || equal(d[k], serverDataBefore[k])) {
            d[k] = clone(res[k])
          }
        }
      }
    }, saveOptions)

    const cancel = () => {
      if (!data.value || !serverData.value) return
      const d = data.value as Record<string, any>
      const sd = serverData.value as Record<string, any>
      for (const k of keys) {
        d[k as string] = clone(sd[k as string])
      }
    }

    return { hasDiff: subHasDiff, keyHasDiff, save: subSave, cancel }
  }

  return {
    fetch,
    data,
    serverData,
    hasDiff,
    save,
    createSubEdit
  }
}

export default useEditFetch
