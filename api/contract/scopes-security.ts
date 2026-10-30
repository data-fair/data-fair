// OpenAPI side of the scope vocabulary (api/src/misc/utils/scopes.ts): the oauth2 security scheme
// and the per-operation `oauth2` security alternative. An operation gets the entry for the tier of
// its permission class; operations with no tier (public, superadmin, settings) get none.
import config from '#config'
import { acceptedScopes, scopeDescriptions, tierOfClass, type ScopeFamily, type ScopeTier } from '../src/misc/utils/scopes.ts'

export const oauth2Scheme = () => ({
  type: 'oauth2',
  description: "Jeton d'accès délivré par l'échange de jeton des identités non humaines de simple-directory (assertion JWT bearer, RFC 7523, aucun secret client). Un jeton sans claim de scope est une session de premier niveau, non restreinte. Un jeton avec scope ne donne accès qu'aux opérations couvertes par ses scopes.",
  flows: {
    clientCredentials: {
      tokenUrl: `${config.directoryUrl}/api/auth/nhi-token`,
      scopes: scopeDescriptions('fr')
    }
  }
})

/**
 * the oauth2 security alternatives of an operation of a family for a permission class, undefined when
 * the class has no tier. In OpenAPI alternatives are ORed and scopes inside one requirement are ANDed:
 * each accepted scope is therefore its own `{ oauth2: [scope] }` alternative.
 */
export const oauth2Alternatives = (family: ScopeFamily, permissionClass: string): Record<string, string[]>[] | undefined => {
  const tier = tierOfClass(permissionClass)
  if (!tier) return undefined
  return tierAlternatives(family, tier)
}

const tierAlternatives = (family: ScopeFamily, tier: ScopeTier): Record<string, string[]>[] =>
  acceptedScopes(family, tier).map(scope => ({ oauth2: [scope] }))

/** the full security of an operation restricted to a tier: the existing alternatives plus its accepted scopes */
export const agentSecurity = (family: ScopeFamily, tier: ScopeTier): Record<string, string[]>[] =>
  [{ apiKey: [] }, { sdCookie: [] }, ...tierAlternatives(family, tier)]

/** permission class of the operations defined inline in the root doc (they carry no x-permissionClass) */
export const rootOperationClasses: Record<string, string> = {
  listDatasets: 'list',
  postDataset: 'post',
  putDataset: 'post',
  listCatalogDatasets: 'list',
  listApplications: 'list',
  postApplication: 'post',
  getApplication: 'read',
  putApplication: 'write',
  patchApplication: 'write',
  deleteApplication: 'admin'
}

const httpMethods = ['get', 'put', 'post', 'delete', 'patch', 'head']
const familyOfPath = (path: string): ScopeFamily | undefined => {
  if (path.startsWith('/datasets') || path.startsWith('/catalog')) return 'datasets'
  if (path.startsWith('/applications')) return 'applications'
}

/** adds the oauth2 alternative to every operation that maps to a permission class */
export const applyOauth2Security = (api: { paths: Record<string, any>, security: Record<string, string[]>[] }, pathPrefix = '') => {
  for (const [path, methods] of Object.entries(api.paths)) {
    const family = familyOfPath(pathPrefix + path)
    if (!family) continue
    for (const method of httpMethods) {
      const op = methods[method]
      if (!op || op.security?.some((s: any) => s.oauth2)) continue
      const permissionClass = op['x-permissionClass'] ?? rootOperationClasses[op.operationId]
      if (!permissionClass) continue
      const alternatives = oauth2Alternatives(family, permissionClass)
      // a copy: some operations are module level objects shared between docs
      if (alternatives) methods[method] = { ...op, security: [...(op.security ?? api.security), ...alternatives] }
    }
  }
}
