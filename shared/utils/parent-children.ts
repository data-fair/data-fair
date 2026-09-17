import { configRefIds, type ConfigRef } from './config-refs.ts'

export type ResourceType = 'dataset' | 'application'
export type ResourceRef = { type: ResourceType, id: string }

/** any resource can be the child of any other: children are looked up in all of these */
export const resourceTypes: ResourceType[] = ['dataset', 'application']

export const sameRef = (a: ResourceRef, b: ResourceRef) => a.type === b.type && a.id === b.id

/** A way for a parent resource to reference the children it uses. Adding a way to relate two resources means adding a line here. */
type ResourceLink = {
  parentType: ResourceType
  childType: ResourceType
  isAvailable: (parent: any) => boolean
  read: (parent: any) => string[]
  /** mongo path matching the parents whose link references a given child id */
  filterPath: string
}

const links: ResourceLink[] = [
  {
    parentType: 'dataset',
    childType: 'dataset',
    isAvailable: (dataset) => !!dataset.isVirtual,
    read: (dataset) => dataset.virtual?.children ?? [],
    filterPath: 'virtual.children'
  },
  {
    parentType: 'application',
    childType: 'dataset',
    isAvailable: () => true,
    read: (application) => configRefIds(application.configuration?.datasets as ConfigRef[]),
    filterPath: 'configuration.datasets.id'
  },
  {
    parentType: 'application',
    childType: 'application',
    isAvailable: () => true,
    read: (application) => configRefIds(application.configuration?.applications as ConfigRef[]),
    filterPath: 'configuration.applications.id'
  }
]

/** The children a resource references, read from the resource itself (stored, or edited and not saved yet). */
export const childRefs = (parentType: ResourceType, parent: any): ResourceRef[] =>
  links
    .filter(link => link.parentType === parentType && link.isAvailable(parent))
    .flatMap(link => link.read(parent).map(id => ({ type: link.childType, id })))

/** The other direction: one mongo filter per collection that may hold a parent of the given resource. */
export const parentFilters = (child: ResourceRef): { type: ResourceType, filter: Record<string, any> }[] => {
  const filtersByType = new Map<ResourceType, Record<string, any>[]>()
  for (const link of links.filter(link => link.childType === child.type)) {
    const filters = filtersByType.get(link.parentType) ?? []
    filters.push({ [link.filterPath]: child.id })
    filtersByType.set(link.parentType, filters)
  }
  return [...filtersByType].map(([type, filters]) => ({ type, filter: filters.length === 1 ? filters[0] : { $or: filters } }))
}

/** The known children a new version of a parent would stop referencing. Shared by the api guards and the ui warnings. */
export const orphanRefs = (children: ResourceRef[], parentType: ResourceType, newParent: any): ResourceRef[] => {
  const referenced = childRefs(parentType, newParent)
  return children.filter(child => !referenced.some(ref => sameRef(ref, child)))
}
