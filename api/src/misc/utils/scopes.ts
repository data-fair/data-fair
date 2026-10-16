// The OAuth-style scope vocabulary data-fair declares: a family (datasets, applications), a tier
// (read < write < admin) and a bare umbrella per family. Tiers are derived from the permission
// classes of shared/permissions/operations.ts; any other class (superadmin operations) has no
// tier and is never granted to a scoped session.
import { hasScope, type SessionState } from '@data-fair/lib-express'
import type { ResourceType } from '#types'

export type ScopeFamily = 'datasets' | 'applications'
export type ScopeTier = 'read' | 'write' | 'admin'

const families: ScopeFamily[] = ['datasets', 'applications']
const tiers: ScopeTier[] = ['read', 'write', 'admin']

export const scopeFamilyOf = (resourceType: ResourceType): ScopeFamily | undefined =>
  (families as string[]).includes(resourceType) ? resourceType as ScopeFamily : undefined

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

/** a higher tier covers the lower ones */
export const acceptedScopes = (family: ScopeFamily, tier: ScopeTier): string[] =>
  [...tiers.slice(tiers.indexOf(tier)).map(t => `${family}:${t}`), family]

export const familyScopes = (family: ScopeFamily): string[] =>
  [family, ...tiers.map(t => `${family}:${t}`)]

/** unrestricted sessions (no scope claim) are always allowed */
export const scopeAllowsClass = (sessionState: SessionState, resourceType: ResourceType, operationClass: string): boolean => {
  if (!sessionState.scopes) return true
  const family = scopeFamilyOf(resourceType)
  const tier = tierOfClass(operationClass)
  if (!family || !tier) return false
  return hasScope(sessionState, acceptedScopes(family, tier))
}

const descriptions: Record<ScopeFamily, Record<'fr' | 'en', Record<'umbrella' | ScopeTier, string>>> = {
  datasets: {
    fr: {
      umbrella: 'Tous les droits sur les jeux de données',
      read: 'Lire les jeux de données, leurs données, leur journal',
      write: 'Modifier les jeux de données et leurs données, en créer',
      admin: 'Administrer les jeux de données : suppression, permissions, publication'
    },
    en: {
      umbrella: 'All dataset scopes',
      read: 'Read datasets, their data and journal',
      write: 'Edit datasets and their data, create datasets',
      admin: 'Administer datasets: deletion, permissions, publication'
    }
  },
  applications: {
    fr: {
      umbrella: 'Tous les droits sur les applications',
      read: 'Lire les applications, leur configuration, leur journal',
      write: 'Modifier les applications et leur configuration, en créer',
      admin: 'Administrer les applications : suppression, permissions, publication'
    },
    en: {
      umbrella: 'All application scopes',
      read: 'Read applications, their configuration and journal',
      write: 'Edit applications and their configuration, create applications',
      admin: 'Administer applications: deletion, permissions, publication'
    }
  }
}

export const scopeDescriptions = (locale: 'fr' | 'en'): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const family of families) {
    const d = descriptions[family][locale]
    out[family] = d.umbrella
    for (const tier of tiers) out[`${family}:${tier}`] = d[tier]
  }
  return out
}
