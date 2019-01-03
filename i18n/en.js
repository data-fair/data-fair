// WARN: do not use underscore in keys, it is used as delimiter when reading
// messages from environment variables

module.exports = {
  common: {
    title: 'DataFair',
    description: 'Données facilement Trouvables, Accessibles, Interopérables et Réutilisables'
  },
  pages: {
    root: {
      title: 'Accueil'
    },
    datasets: {
      title: 'Jeux de données'
    },
    about: {
      title: 'A propos'
    },
    install: {
      title: 'Installation',
      i18n: {
        i18nKey: 'Clé dans le fichier I18N',
        i18nVar: `Variable d'environnement`,
        i18nVal: 'Valeur'
      },
      config: {
        link: 'Configuration',
        varKey: 'Clé dans le fichier de configuration',
        varName: `Variable d'environnement`,
        varDesc: 'Description',
        varDefault: 'Valeur par défaut'
      }
    },
    interoperate: {},
    'user-guide': {}
  },
  notifications: {
    successes: {

    },
    errors: {

    }
  }
}
