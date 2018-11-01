// WARN: do not use underscore in keys, it is used as delimiter when reading
// messages from environment variables

module.exports = {
  common: {
    title: 'DataFair',
    description: 'Données Facilement trouvables, Accessibles, Interopérables et Réutilisables',
    login: `Se connecter / S'inscrire`,
    authrequired: 'Vous devez être authentifié pour utiliser ce service.',
    seemore: 'En savoir plus'
  },
  pages: {
    root: {
      title: 'Accueil',
      description: `Enrichissez et publiez facilement vos données. Vous pouvez les utiliser dans des applications dédiées et les mettre a disposition d'autres personnes en mode ouvert ou privé.`
    },
    datasets: {
      title: 'Jeux de données',
      description: `Cet espace vous permet de transformer vos fichiers de données en flux interopérables que vous pouvez mettre à disposition d'autres utilisateurs ou utiliser dans des applications spécifiques.`
    },
    services: {
      title: 'Services',
      description: `Vous pouvez réutiliser d'autres services (API) pour enrichir vos données ou accéder à d'autres données dans les applications, comme par exemple des fonds de carte.`
    },
    applications: {
      title: 'Applications',
      description: `Vous pouvez ici configurer des applications qui vont utiliser vos flux de données. Ces applications peuvent ensuite être partagées ou intégrées dans d'autres sites web.`
    },
    catalogs: {
      title: 'Catalogues externes',
      description: `Cet espace vous permet de configurer des liens vers des catalogues distants, vers lesquels vous pourrez ensuite publier vos jeux de données et réutilisations.`
    },
    settings: {
      title: 'Paramètres',
      description: `Cette page vous permet de régler différents paramètres`
    },
    about: {
      title: 'A propos',
      overview: {
        title: 'Aperçu fonctionnel'
      },
      'technical-overview': {
        title: 'Aperçu technique'
      },
      license: {
        title: 'Licence'
      }
    },
    install: {
      title: 'Installation',
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
        varDefault: 'Valeur par défaut',
        varDescriptions: {
          publicUrl: `<b>IMPORTANT.</b> L'URL à laquelle le service sera exposé. Par exemple https://koumoul.com/s/data-fair`,
          wsPublicUrl: `<b>IMPORTANT.</b> L'URL à laquelle la connection socket sera exposée. Par exemple wss://koumoul.com/s/data-fair`,
          directoryUrl: `<b>IMPORTANT.</b> L'URL à laquelle le service de gestion des utilisateurs est exposé. Par exemple https://koumoul.com/s/simple-directory`,
          mongoUrl: 'La chaine de connexion complète à la base de données MongoDB.',
          analytics: 'JSON de configuration des analytics, correspond à la partie "modules" de configuration de la librairie <a href="https://github.com/koumoul-dev/vue-multianalytics#modules">vue-multianalytics</a>',
          elasticsearch: {
            host: `Serveur ElasticSearch.`,
            defaultAnalyzer: 'Analyseur par défaut.',
            maxBulkLines: 'Nombre de lignes maximum pour les traitements en masse.',
            maxBulkChars: 'Nombre de caractères maximum pour les traitements en masse.'
          },
          defaultRemoteKey: {
            value: `Clé a utiliser pour appeler les services distants. A n'utiliser que si vous déployer vos propres services distants.`
          },
          secretKeys: {
            ownerNames: 'Secret partagé avec le service de gestion des utilisateurs et organisations.'
          },
          brand: {
            logo: 'Un lien vers un fichier image représentant votre logo.',
            title: 'Le nom de votre organisation.',
            description: 'La description de votre organisation.',
            url: 'Un lien vers le site web principal de votre organisation.'
          },
          workers: {
            concurrency: 'Le nombre de workers pouvant travailler en parallèle. Ce nombre ne devrait jamais dépasser le nombre de coeurs disponibles sur la machine ou est installé le service.'
          },
          nuxtBuild: {
            active: 'Build Nuxt actif',
            blocking: 'Build Nuxt bloquant'
          },
          i18n: {
            defaultLocale: 'Locale par défaut',
            locales: 'Liste des locales'
          },
          thumbor: {
            url: 'URL du serveur thumbor utilisé pour créer des vignettes des images liées dans les jeux de données',
            key: 'Clé secrète utilisée pour signer les URLs de vignettes thumbor'
          }
        }
      }
    },
    interoperate: {
      title: 'Interopérer',
      applications: {
        title: 'Créer des applications'
      },
      services: {
        title: 'Créer des services'
      },
      api: {
        title: `Publier des données par l'API`
      }
    },
    'user-guide': {
      title: 'Manuel utilisateur',
      introduction: {
        title: 'Introduction à la plateforme'
      },
      dataset: {
        title: 'Importer ses propres données',
        description: `Les jeux de données sont créés en chargeant des fichiers. Ils sont stockés, analysés et un schéma de données est déduit. Les données sont ensuite indexées suivant ce schéma et peuvent être requêtées au travers d'une API Rest. Les champs du schéma peuvent être sémantisés, ce qui permet ensuite d'enrichir les données et de les réutiliser dans des applications dédiées.`
      },
      format: {
        title: 'Format de fichiers pris en charge'
      },
      concepts: {
        title: 'Les concepts'
      },
      permission: {
        title: 'Permissions, gérez les droits d\'accès'
      },
      service: {
        title: 'Intégrer des services distants',
        description: `Les fonctionnalités de services distants peuvent être intégrées facilement. Le service stocke les informations d'accès et permet de réappliquer des permissions sur chaque fonctionnalité. On peut grâce à ce mécanisme enrichir facilement ses propres données avec d'autres données. Des non informaticiens peuvent utiliser facilement des APIs tierces avec leurs propres données.`
      },
      application: {
        title: 'Configurer des applications',
        description: `Les applications sont des services distants qui permettent d'exploiter au maximum le potentiel des données. Grâce à la sémantisation, on peut déterminer les applications les plus appropriées aux données que l'on manipule. Il ne reste alors plus qu'à les configurer pour pouvoir les utiliser.`
      },
      enrichment: {
        title: 'Enrichissez vos données avec nos services'
      },
      catalog: {
        title: 'Publiez vos données sur d\'autres plateformes'
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
