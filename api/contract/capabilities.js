const capabilities = {
  type: 'object',
  properties: {
    index: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Filterable on exact value',
      'x-i18n-title': { fr: 'Filtrable sur valeur exacte' },
      description: 'Disable this capability if the data contains, for example, long texts for which exact value filters make little sense.',
      'x-i18n-description': { fr: 'Désactivez cette capacité si la donnée contient par exemple des textes longs pour lesquels des filtres sur valeurs exactes ont peu de sens.' }
    },
    values: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Sortable and groupable',
      'x-i18n-title': { fr: 'Triable et groupable' },
      description: 'Disable this capability if the data contains, for example, long texts for which sorting or grouping by value makes little sense.',
      'x-i18n-description': { fr: 'Désactivez cette capacité si la donnée contient par exemple des textes longs pour lesquels trier ou grouper par valeur a peu de sens.' }
    },
    textStandard: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Text analyzed for full-text search',
      'x-i18n-title': { fr: 'Texte analysé pour recherche textuelle' },
      description: 'Disable this capability for a code, a URL, etc. Any content on which a word search makes little sense.',
      'x-i18n-description': { fr: 'Désactivez cette capacité dans le cas d\'un code, une url, etc. N\'importe quel contenu sur lequel la recherche de mots a peu de sens.' }
    },
    text: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Text analyzed specifically for the French language',
      'x-i18n-title': { fr: 'Texte analysé spécifiquement pour la langue française' },
      description: 'Disable this capability for any content that is not in French or on which a word search makes little sense.',
      'x-i18n-description': { fr: 'Désactivez cette capacité pour tout contenu qui n\'est pas en langue française ou pour lequel la recherche de mots a peu de sens.' }
    },
    textAgg: {
      type: 'boolean',
      default: false,
      layout: 'switch',
      title: 'Word statistics',
      'x-i18n-title': { fr: 'Statistiques de mots' },
      description: 'Enable this capability if you intend to get statistics on word occurrences (for example to build a word cloud).',
      'x-i18n-description': { fr: 'Activez cette capacité si vous avez l\'intention d\'obtenir des statistiques sur les occurrences de mots (par exemple pour construire un nuage de mots).' }
    },
    wildcard: {
      type: 'boolean',
      default: false,
      layout: 'switch',
      title: 'Text filterable on a group of characters',
      'x-i18n-title': { fr: 'Texte filtrable sur groupe de caractères' },
      description: 'Enable this capability if you intend to filter this content specifically on a sequence of characters (for example if a filter on whole words or on exact value is not suitable).',
      'x-i18n-description': { fr: 'Activez cette capacité si vous avez l\'intention de filtrer ce contenu spécifiquement sur une suite de caractères (par exemple si un filtre sur mots entiers ou sur valeur exacte ne convient pas).' }
    },
    insensitive: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Improved sorting with case and accents',
      'x-i18n-title': { fr: 'Tri amélioré avec casse et accents' },
      description: 'Disable this capability if the content will not be used for sorting or if it does not contain variations with accents and capital letters.',
      'x-i18n-description': { fr: 'Désactivez cette capacité si le contenu ne sera pas utilisé pour du tri ou bien s\'il ne contient pas de variations avec accents et majuscules.' }
    },
    geoShape: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Complex geometric shapes',
      'x-i18n-title': { fr: 'Formes géométriques complexes' },
      description: 'Disable this capability if the data only contains basic point geometries or if querying the geometries from their centroids only is enough for your needs.',
      'x-i18n-description': { fr: 'Désactivez cette capacité si la donnée ne contient que des géométries basiques de points ou bien si requêter les géométries uniquement à partir de leurs centroïdes est suffisant pour vos besoins.' }
    },
    vtPrepare: {
      type: 'boolean',
      default: false,
      layout: 'switch',
      title: 'Prepared vector tiles',
      'x-i18n-title': { fr: 'Tuiles vectorielles préparées' },
      description: 'Enable this capability to precompute elements used to build vector tiles for the map rendering of the dataset. Enable this option if the dataset contains dense geographic data to display in large quantities. The trade-off is a longer indexing time and a larger volume of indexed data.',
      'x-i18n-description': { fr: 'Activez cette capacité pour précalculer des éléments utiles à la construction de tuiles vectorielles pour le rendu cartographique du jeu de données. Activez cette option si le jeu de données contient des données géographiques denses à afficher en grande quantité. La contrepartie est une augmentation du temps d\'indexation et du volume de données indexées.' }
    },
    indexAttachment: {
      type: 'boolean',
      default: true,
      layout: 'switch',
      title: 'Attachment content analyzed for full-text search',
      'x-i18n-title': { fr: 'Contenu des pièces jointes analysé pour recherche textuelle' },
      description: 'Disable this option if you want the attachments to be simply downloadable and extracting their text content for word search is not relevant.',
      'x-i18n-description': { fr: 'Désactivez cette option si vous souhaitez que les pièces jointes soient simplement téléchargeables et que l\'extraction de leur contenu textuel pour recherche de mots n\'est pas pertinente.' }
    }
  }
}

export default capabilities

/**
 * the French title of a capability, for the API error messages written in French
 * @param {string} key
 * @returns {string}
 */
export const capabilityTitleFr = (key) => {
  /** @type {any} */
  const prop = /** @type {Record<string, any>} */(capabilities.properties)[key]
  return prop?.['x-i18n-title']?.fr ?? prop?.title ?? key
}
