import settingsSchema from '../../../../api/types/settings/schema.js'

export type TopicResource = {
  id: string,
  title: string,
  owner: { type: string, id: string, department?: string },
  // `integrity` rides along on a dataset: the integrity topics only exist for an enrolled one.
  // It is stripped from the API response for anyone without readIntegrity, so a user who cannot
  // see the verdict cannot subscribe to it either — the gate falls out of the projection.
  integrity?: { active?: boolean },
  isRest?: boolean,
  isVirtual?: boolean,
  isMetaOnly?: boolean
}

// on a resource page we use the definite article ("Le ..."); fall back to the generic schema title.
const resourceTitles: Record<string, Record<string, string>> = {
  fr: {
    'dataset-data-updated': 'Les données du jeu de données ont été mises à jour',
    'dataset-draft-data-updated': 'Les données du jeu de données ont été mises à jour en mode brouillon',
    'dataset-structure-updated': 'La structure du jeu de données a été mise à jour',
    'dataset-error': 'Le jeu de données a rencontré une erreur',
    'dataset-breaking-change': 'Le jeu de données rencontre une rupture de compatibilité',
    'application-error': 'La visualisation a rencontré une erreur'
  },
  en: {
    'dataset-data-updated': 'Data of this dataset was updated',
    'dataset-draft-data-updated': 'Draft data of this dataset was updated',
    'dataset-structure-updated': 'Structure of this dataset was updated',
    'dataset-error': 'This dataset encountered an error',
    'dataset-breaking-change': 'This dataset has a breaking compatibility change',
    'application-error': 'This visualization encountered an error'
  }
}

/**
 * The event topics a user can subscribe to on one resource page, with their keys and labels.
 * Webhooks and notifications differ on one topic: REST line operations signal `data-updated`
 * to webhooks only (see docs/architecture/notifications.md §10).
 */
export const getResourceTopics = (
  resource: TopicResource,
  resourceType: 'dataset' | 'application',
  channel: 'notifications' | 'webhooks',
  locale: string
): { key: string, title: string }[] => {
  // Drafts only exist on file-based datasets.
  const canHaveDraft = resourceType === 'dataset' && !resource.isRest && !resource.isVirtual && !resource.isMetaOnly
  return settingsSchema.properties.webhooks.items.properties.events.items.oneOf
    .filter((item: any) => {
      if (!item.const.startsWith(resourceType)) return false
      if (item.const === 'dataset-dataset-created') return false
      if (item.const === 'dataset-finalize-end') return false
      if (item.const === 'application-application-created') return false
      // only on a dataset that is actually enrolled: offering "integrity breached" on a dataset
      // with no integrity would be a subscription that can never fire
      if (item.const.startsWith('dataset-integrity-')) return !!resource.integrity?.active
      if (item.const === 'dataset-draft-data-updated' && !canHaveDraft) return false
      if (item.const === 'dataset-data-updated' && resource.isRest && channel === 'notifications') return false
      return true
    })
    .map((item: any) => ({
      // subscribe by stable id (not slug — slugs change on rename); the portal app does the same.
      key: `data-fair:${item.const}:${resource.id}`,
      title: resourceTitles[locale]?.[item.const] ?? resourceTitles.fr[item.const] ?? item.title
    }))
}

export const getResourceSender = (resource: TopicResource) => {
  let sender = `${resource.owner.type}:${resource.owner.id}`
  if (resource.owner.department) sender += ':' + resource.owner.department
  return sender
}
