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
