// The OAuth-style scope vocabulary data-fair declares: a family (datasets, applications), a tier
// (read < write < admin) and a bare umbrella per family, plus the global tier scopes all:read /
// all:write / all:admin shared by every service of the platform (lib-common-types defineScopes).
// Tiers are derived from the permission classes of shared/permissions/operations.ts; any other class
// (superadmin operations) has no tier and is never granted to a scoped session.
import { hasScope, assertReqScope, type SessionState } from '@data-fair/lib-express'
import { defineScopes, type ScopeTier } from '@data-fair/lib-common-types/scopes.js'
import type { RequestHandler } from 'express'
import type { ResourceType } from '#types'

export type { ScopeTier }

export const vocabulary = defineScopes({
  datasets: {
    tiers: ['read', 'write', 'admin'],
    descriptions: {
      umbrella: { fr: 'Tous les droits sur les jeux de données', en: 'All dataset scopes' },
      read: { fr: 'Lire les jeux de données, leurs données, leur journal', en: 'Read datasets, their data and journal' },
      write: { fr: 'Modifier les jeux de données et leurs données, en créer', en: 'Edit datasets and their data, create datasets' },
      admin: { fr: 'Administrer les jeux de données : suppression, permissions, publication', en: 'Administer datasets: deletion, permissions, publication' }
    }
  },
  applications: {
    tiers: ['read', 'write', 'admin'],
    descriptions: {
      umbrella: { fr: 'Tous les droits sur les applications', en: 'All application scopes' },
      read: { fr: 'Lire les applications, leur configuration, leur journal ; les applications qui référencent des jeux de données demandent aussi datasets:read', en: 'Read applications, their configuration and journal; applications referencing datasets also need datasets:read' },
      write: { fr: 'Modifier les applications et leur configuration, en créer', en: 'Edit applications and their configuration, create applications' },
      admin: { fr: 'Administrer les applications : suppression, permissions, publication', en: 'Administer applications: deletion, permissions, publication' }
    }
  }
})
/** acceptedScopes: a higher tier, the umbrella and the global tier scopes at or above cover a tier */
export const { acceptedScopes, familyScopes, scopeDescriptions } = vocabulary
export type ScopeFamily = typeof vocabulary.families[number]

export const scopeFamilyOf = (resourceType: ResourceType): ScopeFamily | undefined =>
  (vocabulary.families as string[]).includes(resourceType) ? resourceType as ScopeFamily : undefined

const tierByClass: Record<string, ScopeTier> = {
  list: 'read',
  read: 'read',
  readAdvanced: 'read',
  write: 'write',
  manageOwnLines: 'write',
  post: 'write',
  admin: 'admin',
  manageMasterData: 'admin'
}

export const tierOfClass = (operationClass: string): ScopeTier | undefined =>
  Object.hasOwn(tierByClass, operationClass) ? tierByClass[operationClass] : undefined

/**
 * Mounted in front of a family's routers: a scoped session holding no scope of the family is
 * refused (403), and the request is marked scope-checked so the routes can read the session; the
 * tier is then checked per operation by the permission core (list / canDoForOwner). Unrestricted
 * sessions pass and are marked harmlessly.
 * A scoped token without the family therefore gets less than anonymous on the family's public
 * resources, and loses the application-key bypass a Referer would otherwise give (fail closed).
 * For an in-family scoped bearer the application-key / Referer bypass operations are intersected
 * with the token's tier (a datasets:read token on a form app loses createLine).
 */
export const scopeFamilyGate = (family: ScopeFamily): RequestHandler => (req, _res, next) => {
  assertReqScope(req, familyScopes(family))
  next()
}

/** unrestricted sessions (no scope claim) are always allowed */
export const scopeAllowsClass = (sessionState: SessionState, resourceType: ResourceType, operationClass: string): boolean => {
  if (!sessionState.scopes) return true
  const family = scopeFamilyOf(resourceType)
  const tier = tierOfClass(operationClass)
  if (!family || !tier) return false
  return hasScope(sessionState, acceptedScopes(family, tier))
}
