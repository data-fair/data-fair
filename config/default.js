module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5601',
  wsPublicUrl: 'ws://localhost:5600',
  directoryUrl: 'http://localhost:5700',
  dataDir: './data/' + (process.env.NODE_ENV || 'development'),
  mongoUrl: 'mongodb://localhost:27017/data-fair-' + (process.env.NODE_ENV || 'development'),
  elasticsearch: {
    host: 'localhost:9200'
  },
  indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    }
  },
  defaultLimits: {
    // Maximum storage space per user or organization
    // -1 for unlimited storage
    totalStorage: -1,
    // Maximum storage space for 1 dataset
    datasetStorage: -1
  },
  workers: {
    concurrency: 4,
    pollingInterval: 1000
  },
  headers: {
    storedBytesLimit: 'X-TaxMan-RateLimit-Limit-StoreBytes',
    storedBytesRemaining: 'X-TaxMan-RateLimit-Remaining-StoreBytes'
  },
  adminRole: 'admin',
  // A global default API key for backend to backend calls to remote services
  defaultRemoteKey: null,
  locks: {
    // in seconds
    ttl: 60
  },
  analytics: null, // use a tracking id for google analytics here
  licenses: [{
    title: 'Licence Ouverte / Open Licence',
    href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence'
  }, {
    title: 'Open Database License (ODbL)',
    href: 'https://spdx.org/licenses/ODbL-1.0.html#licenseText'
  }],
  applications: [{
    title: 'Infos parcelles (bêta)',
    description: 'Cette application permet de visualiser des informations additionnelles sur certaines parcelles et de les mettre en évidence.',
    href: 'https://koumoul.com/s/infos-parcelles/'
  }, {
    title: 'Infos localisations (bêta)',
    description: 'Cette application permet de visualiser sur une carte des données géolocalisées.',
    href: 'https://koumoul.com/s/infos-loc/'
  }, {
    title: 'Portail thématique (bêta)',
    description: 'Cette application permet de créer rapidement un portail pour exposer des jeux de données, des réutilisations et des ressources externes autour de thèmes définis lors de la configuration du portail.',
    href: 'https://staging.koumoul.com/s/portail-thematique/'
  }],
  remoteServices: [{
    title: 'Données Entreprises',
    description: `
Ce service permet de récupérer les informations des entreprises de France et de leurs établissements. Les principales clés sont les codes officiels SIRET et SIREN.

La donnée provient initialement de la base Sirène publiée par l'INSEE et est enrichie avec ces sources : BODACC, Infogreffe, NAF et BAN.

La documentation de tous les champs disponibles est consultable [ici](https://koumoul.com/s/sirene/schema-doc).

Toutes les modifications sont historisées, ce qui permet d'avoir accès à des dynamiques dans le temps, comme par exemple le nombre de créations ou de suppressions d'entreprises dans un secteur particulier.`,
    href: 'https://koumoul.com/s/sirene/api-docs.json'
  }, {
    title: 'Géocoder',
    description: 'Ce service permet de géocoder des adresses, c\'est à dire de déterminer des coordonnées latitude / longitude à partir d\'éléments constituant une adresse comme le nom et le numéro de rue, le code postal ou le code INSEE, le nom de la ville ou une requête textuelle contenant ces différents éléments.',
    href: 'https://koumoul.com/s/geocoder/api/v1/api-docs.json'
  }, {
    title: 'Cadastre',
    description: 'Ce service permet de récupérer des informations de parcelles cadastrales depuis leurs codes officiels. Les informations retournées contiennent notamment la localisation et la contenance de la parcelle.',
    href: 'https://koumoul.com/s/cadastre/api-docs.json'
  }, {
    title: 'Divisions administratives',
    description: 'Ce service permet de récupérer des informations sur les divisions administratives françaises : régions, départements, EPCI et communes. Les données portent, entre-autres, sur la population, la fiscalité et des tracés vectoriels.',
    href: 'https://koumoul.com/s/insee-mapping/api/v1/api-docs.json'
  }]
}
