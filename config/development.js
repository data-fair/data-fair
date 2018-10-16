module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5600',
  wsPublicUrl: 'ws://localhost:5600',
  dataDir: './data/development',
  openapiViewerUrl: 'http://localhost:5600/openapi-viewer/',
  defaultLimits: {
    totalStorage: 1024 * 1024 * 1024,
    datasetStorage: -1
  },
  locks: {
    // in seconds
    ttl: 4
  },
  /* For virtual box debugging
  publicUrl: 'http://10.0.2.2:5600',
  wsPublicUrl: 'ws://10.0.2.2:5600',
  directoryUrl: 'https://staging.koumoul.com',
  */
  secretKeys: {
    ownerNames: 'dev_secret'
  },
  cache: {
    disabled: true
  },
  browserLogLevel: 'debug',
  applications: [{
    title: 'Infos parcelles (recette)',
    url: 'https://staging.koumoul.com/s/infos-parcelles/',
    public: true
  }, {
    title: 'Infos parcelles (dev)',
    url: 'http://localhost:5801/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }],
    datasetsFilters: [{ bbox: ['true'], concepts: ['http://dbpedia.org/ontology/codeLandRegistry'] }]
  }, {
    title: 'Infos localisations (recette)',
    url: 'https://staging.koumoul.com/s/infos-loc/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }],
    datasetsFilters: [{ bbox: ['true'] }]
  }, {
    title: 'Infos localisations (dev)',
    url: 'http://localhost:5810/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }],
    datasetsFilters: [{ bbox: ['true'] }]
  }, {
    title: 'Portail thématique (recette)',
    url: 'https://staging.koumoul.com/s/portail-thematique/',
    public: true
  }, {
    title: 'Portail thématique (dev)',
    url: 'http://localhost:5810/',
    public: true
  }, {
    title: 'Graphiques simples (dev)',
    url: 'http://localhost:3001/',
    public: true
  }, {
    title: 'Observatoire des entreprises (bêta)',
    url: 'https://koumoul.com/s/observatoire-entreprises/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }, { 'api-id': ['sirene-koumoul'] }]
  }],
  remoteServices: [{
    title: 'Données Entreprises (recette)',
    href: 'https://staging.koumoul.com/s/sirene/api-docs.json'
  }, {
    title: 'Données Entreprises (dev)',
    href: 'http://localhost:5201/api-docs.json'
  }, {
    title: 'Géocoder (recette)',
    href: 'https://staging.koumoul.com/s/geocoder/api/v1/api-docs.json'
  }, {
    title: 'Géocoder (dev)',
    href: 'http://localhost:6601/api/v1/api-docs.json'
  }, {
    title: 'Cadastre (recette)',
    href: 'https://staging.koumoul.com/s/cadastre/api-docs.json'
  }, {
    title: 'Cadastre (dev)',
    href: 'http://localhost:7600/api-docs.json'
  }, {
    title: 'Divisions administratives (recette)',
    href: 'https://staging.koumoul.com/s/insee-mapping/api/v1/api-docs.json'
  }, {
    title: 'Service de données cartographiques (recette)',
    href: 'https://staging.koumoul.com/s/tileserver/api/v1/api-docs.json'
  }],
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr'
  }, {
    title: 'Mydatacatalogue',
    href: 'https://mydatacatalogue.fr'
  }]
}
