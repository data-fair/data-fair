export type TopicAudience = 'subscription' | 'webhook' | 'both'

export type TopicCatalogEntry = {
  /** Base key without the `data-fair:` prefix and without the trailing `:<id>` scope. */
  key: string
  title: { fr: string, en: string }
  audience: TopicAudience
  /** Used by the UI to render a clickable URL template. */
  urlTemplate?: 'dataset' | 'application' | 'me'
}

export const topicsCatalog: TopicCatalogEntry[] = [
  // datasets
  {
    key: 'dataset-dataset-created',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: 'Un nouveau jeu de données a été créé',
      en: 'A new dataset has been created'
    }
  },
  {
    key: 'dataset-draft-data-updated',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: "Les données d'un jeu de données ont été mises à jour en mode brouillon",
      en: 'Dataset data has been updated in draft mode'
    }
  },
  {
    key: 'dataset-data-updated',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: "Les données d'un jeu de données ont été mises à jour",
      en: 'Dataset data has been updated'
    }
  },
  {
    key: 'dataset-structure-updated',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: "La structure d'un jeu de données a été mise à jour",
      en: 'A dataset schema has been updated'
    }
  },
  {
    key: 'dataset-error',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: 'Un jeu de données a rencontré une erreur',
      en: 'A dataset has encountered an error'
    }
  },
  {
    key: 'dataset-breaking-change',
    audience: 'both',
    urlTemplate: 'dataset',
    title: {
      fr: 'Un jeu de données rencontre une rupture de compatibilité',
      en: 'A dataset has a breaking change'
    }
  },
  {
    key: 'dataset-finalize-end',
    audience: 'webhook',
    urlTemplate: 'dataset',
    title: {
      fr: 'Un jeu de données a été finalisé',
      en: 'A dataset has been finalized'
    }
  },
  // applications
  {
    key: 'application-application-created',
    audience: 'both',
    urlTemplate: 'application',
    title: {
      fr: 'Une nouvelle visualisation a été créée',
      en: 'A new visualization has been created'
    }
  },
  {
    key: 'application-error',
    audience: 'both',
    urlTemplate: 'application',
    title: {
      fr: 'Une visualisation a rencontré une erreur',
      en: 'A visualization has encountered an error'
    }
  }
]
