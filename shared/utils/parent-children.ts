import { configRefIds, type ConfigRef } from '../application/config-refs.ts'

export type ResourceType = 'dataset' | 'application'
export type ResourceRef = { type: ResourceType, id: string }

/**
 * Any resource can be declared the child of any other, so the children of a resource are looked up
 * in all of these — never in the sole collections it happens to be able to reference.
 */
export const resourceTypes: ResourceType[] = ['dataset', 'application']

/**
 * A way for a resource to reference the child resources it uses. This table is the only place that
 * knows about `virtual` or `configuration`: it follows the features that relate resources to each
 * other and changes with them, while the links themselves are resolved generically through the
 * helpers below. Adding a new way to relate two resources means adding a line here.
 */
type ResourceLink = {
  parentType: ResourceType
  childType: ResourceType
  /** whether a given parent resource carries this link at all */
  isAvailable: (parent: any) => boolean
  /** ids of the children this link references in a parent resource */
  read: (parent: any) => string[]
  /** mongo path matching the parents whose link references a given child id */
  filterPath: string
}

const links: ResourceLink[] = [
  {
    // a dataset references other datasets only as the members it aggregates, i.e. only when virtual
    parentType: 'dataset',
    childType: 'dataset',
    isAvailable: (dataset) => !!dataset.isVirtual,
    read: (dataset) => dataset.virtual?.children ?? [],
    filterPath: 'virtual.children'
  },
  {
    // an application references the datasets it displays in its configuration
    parentType: 'application',
    childType: 'dataset',
    isAvailable: () => true,
    read: (application) => configRefIds(application.configuration?.datasets as ConfigRef[]),
    filterPath: 'configuration.datasets.id'
  },
  {
    // an application references the applications it embeds in its configuration (e.g. a dashboard)
    parentType: 'application',
    childType: 'application',
    isAvailable: () => true,
    read: (application) => configRefIds(application.configuration?.applications as ConfigRef[]),
    filterPath: 'configuration.applications.id'
  }
]

/**
 * The child resources a resource references. It reads the resource itself, so it applies as well to
 * a stored version as to an edited one that is not saved yet — an application's configuration draft,
 * the members being added to a virtual dataset — which is what the parent-side warnings compare.
 */
export const childRefs = (parentType: ResourceType, parent: any): ResourceRef[] =>
  links
    .filter(link => link.parentType === parentType && link.isAvailable(parent))
    .flatMap(link => link.read(parent).map(id => ({ type: link.childType, id })))

/**
 * The other direction: mongo filters matching the resources that reference the given one, one per
 * collection that may hold a parent of it.
 */
export const parentFilters = (child: ResourceRef): { type: ResourceType, filter: Record<string, any> }[] => {
  const filtersByType = new Map<ResourceType, Record<string, any>[]>()
  for (const link of links.filter(link => link.childType === child.type)) {
    const filters = filtersByType.get(link.parentType) ?? []
    filters.push({ [link.filterPath]: child.id })
    filtersByType.set(link.parentType, filters)
  }
  // a type referencing the same child through several links is matched by any of them
  return [...filtersByType].map(([type, filters]) => ({ type, filter: filters.length === 1 ? filters[0] : { $or: filters } }))
}

/**
 * The children a new version of a parent would stop referencing. The api guards and the ui warnings
 * both compare the same two sides through this function: the children as they are known, and the
 * refs read from the version about to be saved.
 */
export const orphanRefs = (children: ResourceRef[], parentType: ResourceType, newParent: any): ResourceRef[] => {
  const referenced = childRefs(parentType, newParent)
  return children.filter(child => !referenced.some(ref => ref.type === child.type && ref.id === child.id))
}
