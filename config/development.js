module.exports = {
  defaultLimits: {
    totalStorage: 1024 * 1024 * 1024,
    datasetStorage: -1
  },
  locks: {
    // in seconds
    ttl: 4
  },
  applications: [{
    title: 'Infos parcelles (recette)',
    description: 'Cette application permet de visualiser des informations additionnelles sur certaines parcelles et de les mettre en évidence.',
    href: 'https://staging.koumoul.com/s/infos-parcelles/'
  }, {
    title: 'Infos parcelles (dev)',
    description: 'Cette application permet de visualiser des informations additionnelles sur certaines parcelles et de les mettre en évidence.',
    href: 'http://localhost:5801/'
  }],
  remoteServices: [{
    title: 'Données Entreprises (recette)',
    description: 'Ces données s\'appuient sur la base Sirène publiée par l\'INSEE et le pivot utilisé pour agréger les données est le code SIREN. La base compte un peu plus de 10 millions d\'établissements et est enrichie avec les sources de données suivantes : Bodacc, Infogreffe, NAF et géocodage. Toutes les modifications sont historisées, ce qui permet d\'avoir accès à des dynamiques dans le temps, comme par exemple le nombre de créations ou de suppressions d\'entreprises dans un secteur particulier.',
    href: 'https://staging.koumoul.com/s/sirene/api-docs.json'
  }, {
    title: 'Géocoder (recette)',
    description: 'Ce service permet de géocoder des adresses, c\'est à dire de déterminer des coordonnées latitude / longitude à partir d\'éléments constituant une adresse comme le nom et le numéro de rue, le code postal ou le code INSEE, le nom de la ville ou une requête textuelle contenant ces différents éléments.',
    href: 'https://staging.koumoul.com/s/geocoder/api/v1/api-docs.json'
  }, {
    title: 'Cadastre (recette)',
    description: 'Ce service permet de récupérer des informations de parcelles cadastrales depuis leurs codes officiels. Les informations retournées contiennent notamment la localisation et la contenance de la parcelle.',
    href: 'https://staging.koumoul.com/s/cadastre/api-docs.json'
  }, {
    title: 'Divisions administratives (recette)',
    description: 'Ce service permet de récupérer des informations sur les divisions administratives françaises : régions, départements, EPCI et communes. Les données portent, entre-autres, sur la population, la fiscalité et des tracés vectoriels.',
    href: 'https://staging.koumoul.com/s/insee-mapping/api/v1/api-docs.json'
  }]
}
