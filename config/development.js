module.exports = {
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
  nuxtBuild: {
    blocking: false
  },
  applications: [{
    title: 'Infos parcelles (recette)',
    href: 'https://staging.koumoul.com/s/infos-parcelles/'
  }, {
    title: 'Infos parcelles (dev)',
    href: 'http://localhost:5801/'
  }, {
    title: 'Infos localisations (recette)',
    href: 'https://staging.koumoul.com/s/infos-loc/'
  }, {
    title: 'Infos localisations (dev)',
    href: 'http://localhost:5810/'
  }, {
    title: 'Portail thématique (recette)',
    href: 'https://staging.koumoul.com/s/portail-thematique/'
  }, {
    title: 'Portail thématique (dev)',
    href: 'http://localhost:5810/'
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
