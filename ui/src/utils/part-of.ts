import { $fetch } from '~/context'
import { resourceTypes, type ResourceRef } from '@data-fair/data-fair-shared/utils/parent-children.ts'

/**
 * The resources defined as the partOf children of a resource. Pages compare this list against the
 * version they are about to save, the same way the api guards do, so that the warning shown before
 * saving matches the answer the api would give.
 */
export const fetchChildRefs = async (parent: { id: string }): Promise<ResourceRef[]> => {
  const childRefsByType = await Promise.all(resourceTypes.map(async (type) => {
    // each resource type is exposed as the collection of its plural
    const res = await $fetch<{ results: { id: string }[] }>(`${type}s`, { query: { partOf: parent.id, size: 1000, select: 'id' } })
    return res.results.map(result => ({ type, id: result.id }))
  }))
  return childRefsByType.flat()
}
