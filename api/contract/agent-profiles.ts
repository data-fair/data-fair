/**
 * The deployment's agent profile vocabulary (docs/architecture/agent-profiles.md). The agents
 * index declares it whole; each service document declares the cells it fills, under the same
 * names. Agent configurations are written with these names: append only, never rename.
 */
import type { IndexProfile } from '@data-fair/openapi-mcp'

type Localized = { fr: string, en: string }

export const silos = {
  datasets: { fr: 'jeux de données', en: 'datasets' },
  applications: { fr: 'applications', en: 'applications' },
  portals: { fr: 'portails', en: 'portals' },
  processings: { fr: 'traitements', en: 'processings' },
  catalogs: { fr: 'catalogues', en: 'catalogs' },
  notifications: { fr: 'notifications', en: 'notifications' },
  metrics: { fr: "métriques d'audience", en: 'audience metrics' },
  account: { fr: 'compte', en: 'account' }
} as const satisfies Record<string, Localized>
export type Silo = keyof typeof silos

export const tiers = {
  read: {
    title: { fr: 'Lire', en: 'Read' },
    description: { fr: 'Consulter sans rien modifier.', en: 'Look without changing anything.' }
  },
  write: {
    title: { fr: 'Modifier', en: 'Write' },
    description: { fr: 'Créer et modifier le contenu des ressources.', en: 'Create and edit the content of resources.' }
  },
  manage: {
    title: { fr: 'Administrer', en: 'Manage' },
    description: { fr: 'Changer qui accède aux ressources, leur exposition et leur existence.', en: 'Change who can access resources, whether they are exposed, and whether they exist.' }
  }
} as const satisfies Record<string, { title: Localized, description: Localized }>
export type Tier = keyof typeof tiers

const tierOrder: Tier[] = ['read', 'write', 'manage']
const siloNames = Object.keys(silos) as Silo[]

export const cell = (tier: Tier, silo: Silo): string => `${tier}_${silo}`

const cellProfile = (tier: Tier, silo: Silo): IndexProfile => {
  const below = tierOrder[tierOrder.indexOf(tier) - 1]
  const profile: IndexProfile = {
    title: { fr: `${tiers[tier].title.fr} — ${silos[silo].fr}`, en: `${tiers[tier].title.en} — ${silos[silo].en}` },
    description: {
      fr: `${tiers[tier].description.fr} Périmètre : ${silos[silo].fr}.`,
      en: `${tiers[tier].description.en} Scope: ${silos[silo].en}.`
    }
  }
  if (below) profile.includes = [cell(below, silo)]
  return profile
}

const catalogProfile: IndexProfile = {
  title: { fr: 'Catalogue', en: 'Catalog' },
  description: {
    fr: 'Les ressources publiées sur un portail, sous leur forme destinée aux utilisateurs finaux.',
    en: 'The resources published on a portal, in their end-user form.'
  }
}

/** The whole vocabulary, as the agents index declares it. `catalog` comes first: it is the default. */
export function vocabulary (): Record<string, IndexProfile> {
  const out: Record<string, IndexProfile> = { catalog: catalogProfile }
  for (const tier of tierOrder) {
    out[tier] = { title: tiers[tier].title, description: tiers[tier].description, includes: siloNames.map(s => cell(tier, s)) }
  }
  for (const silo of siloNames) for (const tier of tierOrder) out[cell(tier, silo)] = cellProfile(tier, silo)
  return out
}

/** What a service document declares: `catalog` if it fills it, and the three cells of each of its silos. */
export function documentProfiles (filled: Silo[], withCatalog: boolean): Record<string, IndexProfile> {
  const out: Record<string, IndexProfile> = withCatalog ? { catalog: catalogProfile } : {}
  for (const silo of filled) for (const tier of tierOrder) out[cell(tier, silo)] = cellProfile(tier, silo)
  return out
}
