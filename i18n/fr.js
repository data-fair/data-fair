// WARN: do not use underscore in keys, it is used as delimiter when reading
// messages from environment variables

module.exports = {
  common: {
    title: 'DataFair',
    description: 'Données facilement Trouvables, Accessibles, Interopérables et Réutilisables'
  },
  pages: {
    root: {
      title: 'Accueil',
      description: 'Partagez et enrichissez facilement vos données pour pouvoir les utiliser dans des applications dédiées.'
    },
    datasets: {
      title: 'Jeux de données'
    },
    root: {
      title: 'Accueil'
    },
    about: {
      title: 'A propos',
      description: 'Cette section donne un aperçu rapide de ce que fait le service.',
      overview: {
        title: 'Aperçu fonctionnel'
      },
      technicaloverview: {
        title: 'Aperçu technique'
      },
      license: {
        title: 'Licence'
      }
    },
    install: {
      title: 'Installation',
      description: 'Cette section, à destination des techniciens, donne toutes les informations nécessaires pour installer et configurer le service sur ses propres serveurs.',
      install: {
        title: `Procédure d'installation`
      },
      config: {
        title: `Configuration avec variables d'environnement`,
        link: 'Configuration',
        i18nKey: 'Clé dans le fichier I18N',
        i18nVar: `Variable d'environnement`,
        i18nVal: 'Valeur',
        varKey: 'Clé dans le fichier de configuration',
        varName: `Variable d'environnement`,
        varDesc: 'Description',
        varDefault: 'Valeur par défaut'
      }
    },
    interoperate: {
      title: 'Créer des applications et services',
      description: 'Cette section, à destination des développeurs, donne toutes les informations nécessaires pour créer ses propres applications ou APIs compatibles avec ce service.',
      applications: {
        title: 'Créer des applications'
      },
      services: {
        title: 'Créer des services'
      }
    },
    userguide: {
      title: 'Manuel utilisateur',
      description: `Ceci est la documentation de notre service de publication de données`,
      use: {
        title: 'Utilisation !!'
      }
    }
  },
  notifications: {
    successes: {

    },
    errors: {

    }
  }
}
