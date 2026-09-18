// Pure logic of the fragments feature (no I/O): see docs/architecture/fragments.md
import type { Permission, ResourceType } from '#types'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { operationsClasses } from '@data-fair/data-fair-shared/permissions/operations.ts'
import { isMasterData } from '../../contract/master-data.js'

export type PartOf = { type: 'dataset' | 'application', id: string }
export type FragmentResourceType = 'datasets' | 'applications'

export const partOfCollectionName = (type: PartOf['type']): FragmentResourceType => type === 'dataset' ? 'datasets' : 'applications'
export const resourceTypeToPartOfType = (resourceType: ResourceType): PartOf['type'] => resourceType === 'datasets' ? 'dataset' : 'application'

/** the operation that gates the owner-change route of each resource type: attaching / detaching hands control over, like a transfer */
export const PART_OF_CHANGE_OPERATION: Record<FragmentResourceType, string> = { datasets: 'changeOwner', applications: 'delete' }

/** keys a fragment can never carry: a fragment is not publishable */
export const FRAGMENT_ONLY_FORBIDDEN_KEYS = ['publicationSites', 'requestedPublicationSites', 'publications']

const parsePartOfParam = (value: string): PartOf => {
  const i = value.indexOf(':')
  const type = i === -1 ? value : value.slice(0, i)
  const id = i === -1 ? '' : value.slice(i + 1)
  if ((type !== 'dataset' && type !== 'application') || !id) throw httpError(400, 'Le paramètre partOf doit être de la forme "dataset:{id}" ou "application:{id}"')
  return { type, id }
}

const CLASS_ORDER = ['list', 'read', 'readAdvanced', 'write', 'admin', 'manageOwnLines']
const MANAGEMENT_CLASSES = ['write', 'admin']
const READ_CLASSES = ['list', 'read']

/**
 * Operations that sit in the `admin` class but are pure reads. They must NOT be carried over
 * individually by rule A of the derivation, and must not trigger its "write implies read" grant:
 * an entry holding only such an operation on the parent is a read-only entry, and a read-only
 * entry never surfaces a fragment (docs/architecture/fragments.md §9). Without this exclusion a
 * parent entry granting just `getPermissions` derived full list/read/readAdvanced on every
 * fragment. An entry that covers the whole `admin` class genuinely holds management operations,
 * so the class-level inheritance above is unaffected.
 */
export const READ_ONLY_ADMIN_OPERATIONS = ['getPermissions', 'readIntegrity', 'readIntegrityRevisions']

const expandOperations = (permission: Permission, resourceType: ResourceType): Set<string> => {
  const ops = new Set<string>(permission.operations ?? [])
  for (const cls of permission.classes ?? []) {
    for (const op of operationsClasses[resourceType]?.[cls] ?? []) ops.add(op)
  }
  return ops
}

/**
 * Derive the ACL of a fragment from its parent's ACL (spec §3.1).
 * - management (write / admin) is inherited class-wise when fully held, operation-wise otherwise, and implies list / read / readAdvanced
 * - read (list / read) is inherited only application -> application
 * - a virtual dataset grants no read on its fragments
 * The who (type, id, email, department, roles, names) is preserved. Deterministic and idempotent.
 */
export const deriveFragmentPermissions = (parentPermissions: Permission[] | undefined, parentType: ResourceType, fragmentType: ResourceType): Permission[] => {
  const derived: Permission[] = []
  for (const permission of parentPermissions ?? []) {
    const ops = expandOperations(permission, parentType)
    const classes = new Set<string>()
    const operations = new Set<string>()
    for (const cls of MANAGEMENT_CLASSES) {
      const parentClassOps = operationsClasses[parentType]?.[cls] ?? []
      if (parentClassOps.length && parentClassOps.every(op => ops.has(op))) classes.add(cls)
    }
    for (const cls of MANAGEMENT_CLASSES) {
      if (classes.has(cls)) continue
      for (const op of operationsClasses[fragmentType]?.[cls] ?? []) {
        if (READ_ONLY_ADMIN_OPERATIONS.includes(op)) continue
        if (ops.has(op)) operations.add(op)
      }
    }
    if (classes.size || operations.size) {
      classes.add('list'); classes.add('read'); classes.add('readAdvanced')
    }
    if (parentType === 'applications' && fragmentType === 'applications') {
      for (const cls of READ_CLASSES) {
        if (classes.has(cls)) continue
        const classOps = operationsClasses.applications[cls] ?? []
        if (classOps.length && classOps.every(op => ops.has(op))) classes.add(cls)
        else for (const op of classOps) if (ops.has(op)) operations.add(op)
      }
    }
    if (!classes.size && !operations.size) continue
    const { classes: _classes, operations: _operations, ...who } = permission
    const result: Permission = { ...who }
    if (classes.size) result.classes = CLASS_ORDER.filter(cls => classes.has(cls))
    if (operations.size) result.operations = [...operations]
    derived.push(result)
  }
  return derived
}

type OwnerLike = { type: string, id: string, department?: string }
export type FragmentLike = { id?: string, owner: OwnerLike, publicationSites?: string[], requestedPublicationSites?: string[], publications?: any[], masterData?: any }
export type ParentLike = { id: string, owner: OwnerLike, isVirtual?: boolean, partOf?: PartOf }

const sameOwner = (a: OwnerLike, b: OwnerLike) => a.type === b.type && a.id === b.id && (a.department ?? undefined) === (b.department ?? undefined)

/** Returns a French refusal message, or null when the resource may become a fragment of the parent (spec §2 invariants). */
export const validatePartOf = ({ fragmentType, fragment, partOf, parent, nbFragments }: { fragmentType: ResourceType, fragment: FragmentLike, partOf: PartOf, parent: ParentLike, nbFragments: number }): string | null => {
  if (fragment.id && partOf.id === fragment.id && resourceTypeToPartOfType(fragmentType) === partOf.type) return 'Une ressource ne peut pas être un fragment d\'elle-même'
  if (parent.partOf) return 'Le parent est lui-même un fragment, un fragment ne peut pas avoir de fragments'
  if (!sameOwner(parent.owner, fragment.owner)) return 'Un fragment doit avoir le même propriétaire que son parent'
  if (fragmentType === 'applications' && partOf.type !== 'application') return 'Une application ne peut être un fragment que d\'une application'
  if (fragmentType === 'datasets' && partOf.type === 'dataset' && !parent.isVirtual) return 'Un jeu de données ne peut être un fragment que d\'un jeu de données virtuel ou d\'une application'
  if (nbFragments > 0) return 'Une ressource qui a des fragments ne peut pas devenir un fragment'
  if (fragment.publicationSites?.length || fragment.requestedPublicationSites?.length) return 'La ressource est publiée sur un portail, retirez la publication avant de la rattacher'
  if (fragment.publications?.length) return 'La ressource est publiée sur un catalogue, retirez la publication avant de la rattacher'
  // reference data exists to be reused across many contexts, and other datasets' extensions point
  // at it: it cannot also be a fragment that hides from listings and dies with a single parent
  if (isMasterData(fragment.masterData)) return 'Un jeu de données de référence ne peut pas être rattaché à un parent, retirez la configuration de données de référence avant de le rattacher'
  return null
}

/** The first key of the patch that a fragment may not carry, or null. */
export const fragmentForbiddenPatchKey = (patch: Record<string, any>, isFragment: boolean): string | null => {
  if (!isFragment) return null
  return FRAGMENT_ONLY_FORBIDDEN_KEYS.find(key => key in patch) ?? null
}

/**
 * The single decision function behind the fragment write guard mounted on every resource write
 * route (`fragments/middlewares.ts`). Returns a French refusal message, or null.
 *
 * Two rules, both of which must hold on ANY write route, not just PATCH:
 * - parentage is changed through a dedicated PATCH flow (`applyPartOfChange`, which gates on the
 *   owner-change operation, validates the parent and replaces the derived ACL). A route that
 *   persists its body as-is must refuse a divergent `partOf` rather than write it raw — otherwise
 *   every one of those guards is bypassed. An *identical* value is tolerated so a read-then-write
 *   round trip of a fragment still works.
 * - a fragment is never publishable, and is never reference data, on any route. The reciprocal of
 *   the same rules in `validatePartOf`: without it the refusal at attach is trivially bypassed by
 *   attaching first and publishing (or declaring reference data) afterwards.
 */
export const fragmentWriteBodyError = (
  body: Record<string, any> | undefined,
  resource: { partOf?: PartOf } | undefined,
  { allowPartOfChange }: { allowPartOfChange: boolean }
): string | null => {
  const writeBody = body ?? {}
  if (!allowPartOfChange && 'partOf' in writeBody &&
    JSON.stringify(writeBody.partOf ?? null) !== JSON.stringify(resource?.partOf ?? null)) {
    return 'partOf ne peut être modifié que par PATCH'
  }
  const isFragment = !!resource?.partOf || !!writeBody.partOf
  const forbiddenKey = fragmentForbiddenPatchKey(writeBody, isFragment)
  if (forbiddenKey) return `Un fragment ne peut pas être publié (propriété ${forbiddenKey})`
  // presence of the key is not the signal here: clearing masterData on a fragment, or sending back
  // an empty sub-object in a read-then-write round trip, must keep working
  if (isFragment && isMasterData(writeBody.masterData)) return 'Un fragment ne peut pas être défini comme donnée de référence'
  return null
}

/**
 * Queries that pin resources by id, by slug or by inverse reference ("which applications use this
 * dataset"). The caller already knows exactly what it is asking for, so hiding fragments there
 * would only break a legitimate lookup.
 */
const PINNING_QUERY_KEYS = ['id', 'ids', 'slug', 'slugs', 'children', 'dataset', 'application']

/**
 * The single mongo filter the `partOf` query param resolves to, shared by the datasets and the
 * applications listings (spec §4):
 * - `partOf=<type>:<id>` — only the fragments of that parent
 * - `partOf=true` — every fragment, whatever its parent
 * - absent, or `partOf=false` — fragments are hidden, unless the query pins resources
 */
export const partOfListFilter = (reqQuery: Record<string, string | undefined>): Record<string, any> | undefined => {
  if (reqQuery.partOf === 'true') return { 'partOf.id': { $exists: true } }
  if (reqQuery.partOf && reqQuery.partOf !== 'false') {
    const partOf = parsePartOfParam(reqQuery.partOf)
    return { 'partOf.type': partOf.type, 'partOf.id': partOf.id }
  }
  if (PINNING_QUERY_KEYS.some(key => reqQuery[key] !== undefined)) return undefined
  return { partOf: { $exists: false } }
}
