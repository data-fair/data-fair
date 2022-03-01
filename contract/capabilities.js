module.exports = {
  type: 'object',
  properties: {
    index: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Filtrable sur valeur exacte',
      description: 'Désactivez cette capacité si la donnée contient par exemple des textes longs pour lesquels des filtres sur valeurs exactes ont peu de sens.'
    },
    values: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Triable et groupable',
      description: 'Désactivez cette capacité si la donnée contient par exemple des textes longs pour lesquels trier ou grouper par valeur a peu de sens.'
    },
    textStandard: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Texte analysé pour recherche textuelle',
      description: 'Désactivez cette capacité dans le cas d\'un code, une url, etc. N\'importe quel contenu sur lequel la recherche de mots a peu de sens.'
    },
    text: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Texte analysé spécifiquement pour la langue française.',
      description: 'Désactivez cette capacité pour tout contenu qui n\'est pas en langue française ou pour lequel la recherche de mots a peu de sens.'
    },
    textAgg: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Statistiques de mots',
      description: 'Désactivez cette capacité si vous n\'avez pas l\'intention d\'obtenir des statistiques sur les occurences de mots (par exemple pour construire un nuage de mot).'
    },
    insensitive: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Tri amélioré avec casse et accents',
      description: 'Désactivez cette capacité si le contenu ne sera pas utilisé pour du tri ou bien si il ne contient pas de variations avec accents et majuscules.'
    },
    geoShape: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Formes géométriques complexes',
      description: 'Désactivez cette capacité si la donnée ne contient que des géométries basiques de points ou bien si requêter les géométries uniquement à partir de leurs centroïdes est suffisant pour vos besoins.'
    },
    indexAttachment: {
      type: 'boolean',
      default: true,
      'x-display': 'switch',
      title: 'Contenu des pièces jointes analysé pour recherche textuelle',
      description: 'Désactivez cette option si vous souhaitez que les pièces jointes soient simplement téléchargeables et que l\'extraction de leur contenu textuel pour recherche de mots n\'est pas pertinente.'
    }
  }
}
