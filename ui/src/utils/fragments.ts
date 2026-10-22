type PartOf = { type: 'dataset' | 'application', id: string }

/**
 * The `partOf` listing param for a picker opened from a resource: the standalone resources plus the
 * fragments of the resource's family (its own fragments, or its siblings when it is itself a fragment).
 * Fragments are hidden from every listing by default, without this a parent could not pick them.
 */
export const pickerPartOf = (type: PartOf['type'], resource: { id: string, partOf?: PartOf }) => {
  const parent = resource.partOf ?? { type, id: resource.id }
  return `false,${parent.type}:${parent.id}`
}

export type ReferencingResource = { type: PartOf['type'], id: string, title?: string, partOf?: PartOf }

/**
 * The resources referencing a fragment from outside its family: neither its parent nor one of its
 * siblings (an application fragment may use a dataset fragment of the same parent). The API never
 * checks these references (the parent link is deliberately weak), but such a user is broken by the
 * fragment's derived ACL (its readers get nothing on the fragment) and by its deletion with the parent.
 */
export const foreignReferences = (partOf: PartOf, refs: ReferencingResource[]) => {
  const inFamily = (ref: ReferencingResource) =>
    (ref.type === partOf.type && ref.id === partOf.id) ||
    (ref.partOf?.type === partOf.type && ref.partOf.id === partOf.id)
  return refs.filter(ref => !inFamily(ref))
}
