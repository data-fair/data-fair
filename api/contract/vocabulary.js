export default [
  {
    id: 'label',
    title: {
      fr: 'Libellé',
      en: 'Label'
    },
    description: {
      fr: 'Un libellé facilement lisible',
      en: 'An easily readable label'
    },
    identifiers: [
      'http://www.w3.org/2000/01/rdf-schema#label',
      'http://www.bbc.co.uk/ontologies/coreconcepts/label'
    ],
    type: 'string',
    tag: {
      fr: 'Présentation',
      en: 'Presentation'
    }
  },
  {
    id: 'description',
    title: {
      fr: 'Description',
      en: 'Description'
    },
    description: {
      fr: 'Un petit texte descriptif (contenu markdown et HTML accepté)',
      en: 'A short descriptive text (markdown and HTML content accepted)'
    },
    identifiers: [
      'http://schema.org/description'
    ],
    type: 'string',
    tag: {
      fr: 'Présentation',
      en: 'Presentation'
    }
  },
  {
    id: 'image',
    title: {
      fr: 'Image',
      en: 'Image'
    },
    description: {
      fr: 'Une URL vers une image illustration du document courant',
      en: 'A URL linking to an image to illustrate current document'
    },
    identifiers: [
      'http://schema.org/image'
    ],
    type: 'string',
    tag: {
      fr: 'Présentation',
      en: 'Presentation'
    }
  },
  {
    id: 'tag',
    title: {
      fr: 'Étiquette',
      en: 'Tag'
    },
    description: {
      fr: 'Une petite chaîne de caractère utilisable simplement comme critère de classification des lignes',
      en: 'A short string used as classification criteria for the lines'
    },
    identifiers: [
      'https://schema.org/DefinedTermSet'
    ],
    type: 'string',
    tag: {
      fr: 'Présentation',
      en: 'Presentation'
    }
  },
  {
    id: 'color',
    title: {
      fr: 'Couleur',
      en: 'color'
    },
    description: {
      fr: 'Un code couleur spécifique à chaque ligne',
      en: 'A color code for each line'
    },
    identifiers: [
      'https://schema.org/color'
    ],
    type: 'string',
    tag: {
      fr: 'Présentation',
      en: 'Presentation'
    }
  },
  {
    id: 'address',
    title: {
      fr: 'Adresse',
      en: 'Address'
    },
    description: {
      fr: 'Une adresse écrite en une seule chaine de caractère',
      en: 'An address written in a single string'
    },
    identifiers: [
      'http://schema.org/address'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'streetNumber',
    title: {
      fr: 'Numéro de rue',
      en: 'Street number'
    },
    description: {
      fr: 'Un numéro de rue, qui peut contenir des mots comme bis ou ter',
      en: 'A street number than can contain words like bis'
    },
    identifiers: [
      'http://www.ontotext.com/proton/protonext#StreetNumber'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'streetAddress',
    title: {
      fr: 'Rue ou lieu-dit',
      en: 'Street or place'
    },
    description: {
      fr: 'Un nom de rue ou de lieu-dit',
      en: 'A street or place name'
    },
    identifiers: [
      'http://schema.org/streetAddress'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'city',
    title: {
      fr: 'Commune',
      en: 'City'
    },
    description: {
      fr: "Nom d'une commune",
      en: 'Name of a city'
    },
    identifiers: [
      'http://schema.org/City'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'postalCode',
    title: {
      fr: 'Code postal',
      en: 'Postal code'
    },
    description: {
      fr: 'Code postal, sur 5 chiffre',
      en: 'Postal code / zip code'
    },
    identifiers: [
      'http://schema.org/postalCode'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'country',
    title: {
      fr: 'Pays',
      en: 'Country'
    },
    description: {
      fr: "Nom d'un pays",
      en: 'Name of a country'
    },
    identifiers: [
      'http://schema.org/addressCountry'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'region',
    title: {
      fr: 'Région',
      en: 'Region'
    },
    description: {
      fr: "Nom d'une région",
      en: 'Name of a region'
    },
    identifiers: [
      'https://schema.org/addressRegion'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'departement',
    title: {
      fr: 'Département',
      en: 'Department (France)'
    },
    description: {
      fr: "Nom d'un département français",
      en: 'Name of a french department'
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#Departement'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'addressId',
    title: {
      fr: "Identifiant d'adresse",
      en: 'Address id'
    },
    description: {
      fr: "Identifiant d'adresse dans la BAN",
      en: ''
    },
    identifiers: [
      'http://www.w3.org/ns/locn#addressId'
    ],
    type: 'string',
    tag: {
      fr: 'Adresse',
      en: 'Address'
    }
  },
  {
    id: 'codeCommune',
    title: {
      fr: 'Code commune',
      en: ''
    },
    description: {
      fr: 'Code INSEE de la commune, sur 5 caractères, à ne pas confondre avec le code postal.',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#codeCommune'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeDepartement',
    title: {
      fr: 'Code département',
      en: ''
    },
    description: {
      fr: 'Code du département, sur 2 ou 3 caractères',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#codeDepartement'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeRegion',
    title: {
      fr: 'Code région',
      en: ''
    },
    description: {
      fr: 'Code de la région, sur 2 chiffres',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#codeRegion'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeEPCI',
    title: {
      fr: 'Code EPCI',
      en: ''
    },
    description: {
      fr: 'Code du regroupement de communes, sur 9 chiffres',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#EtablissementPublicDeCooperationIntercommunale'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeIRIS',
    title: {
      fr: 'Code IRIS',
      en: ''
    },
    description: {
      fr: "Code d'une zone dans le découpage infracommunal IRIS",
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#codeIRIS',
      'http://rdf.insee.fr/def/geo#IRIS'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeGrandQuartier',
    title: {
      fr: 'Code grand quartier',
      en: ''
    },
    description: {
      fr: "Les grands quartiers sont des regroupements d'îlots urbains dans le découpage infracommunal IRIS",
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#GrandQuartier'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codePays',
    title: {
      fr: 'Code pays (COG)',
      en: ''
    },
    description: {
      fr: 'Code INSEE du pays sur 5 caractères (code officiel géographique)',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#codePays'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'uniteUrbaine2020',
    title: {
      fr: 'Code unité urbaine 2020',
      en: ''
    },
    description: {
      fr: "Code INSEE de l'unité urbaine 2020, sur 5 caractères.",
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#UniteUrbaine2020'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'carreau',
    title: {
      fr: 'Code de carreau de 200m',
      en: ''
    },
    description: {
      fr: 'Code de carreau pour les données INSEE carroyées à 200 mètres.',
      en: ''
    },
    identifiers: [
      'http://rdf.insee.fr/def/geo#Carreau'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'latitude',
    title: {
      fr: 'Latitude',
      en: 'Latitude'
    },
    description: {
      fr: "Coordonné géographique qui permet de se situer par rapport à l'équateur (projection WGS 84)",
      en: 'Geographic coordinate to locate a position compared to the equator (WGS 84 projection)'
    },
    identifiers: [
      'http://schema.org/latitude',
      'http://www.w3.org/2003/01/geo/wgs84_pos#lat'
    ],
    type: 'number',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'longitude',
    title: {
      fr: 'Longitude',
      en: 'Longitude'
    },
    description: {
      fr: 'Coordonnée géographique qui permet de se situer par rapport au méridien de Greenwich (projection WGS 84)',
      en: 'Geographic coordinate to locate a position compared to the Prime/Greenwich meridian (WGS 84 projection)'
    },
    identifiers: [
      'http://schema.org/longitude',
      'http://www.w3.org/2003/01/geo/wgs84_pos#long'
    ],
    type: 'number',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'latLon',
    title: {
      fr: 'Latitude / Longitude',
      en: 'Latitude / Longitude'
    },
    description: {
      fr: 'Paire latitude / longitude, séparées par une virgule (projection WGS 84)',
      en: 'Latitude / longitude tuple, joined by a comma (WGS 84 projection)'
    },
    identifiers: [
      'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    ],
    type: 'string',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'countryCodeISOAlpha2',
    title: {
      fr: 'Code pays (ISO, 2 caractères)',
      en: 'Country code (ISO, 2 chars)'
    },
    description: {
      fr: 'Code pays ou territoire sur 2 caractères (ISO 3166-1 alpha-2)',
      en: 'Country or territory code of 2 chars (ISO 3166-1 alpha-2)'
    },
    identifiers: [
      'http://dbpedia.org/ontology/iso31661Code',
      'https://www.omg.org/spec/LCC/Countries/CountryRepresentation/Alpha2Code'
    ],
    type: 'string',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'countryCodeISOAlpha3',
    title: {
      fr: 'Code pays (ISO, 3 caractères)',
      en: 'Country code (ISO, 3 chars)'
    },
    description: {
      fr: 'Code pays ou territoire sur 3 caractères (ISO 3166-1 alpha-3)',
      en: 'Country or territory code of 3 chars (ISO 3166-1 alpha-3)'
    },
    identifiers: [
      'https://www.omg.org/spec/LCC/Countries/CountryRepresentation/Alpha3Code'
    ],
    type: 'string',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'siret',
    title: {
      fr: 'SIRET',
      en: ''
    },
    description: {
      fr: 'Le numéro SIRET est un identifiant numérique de 14 chiffres composé du SIREN (9 chiffres) et du NIC (5 chiffres)',
      en: ''
    },
    identifiers: [
      'http://www.datatourisme.fr/ontology/core/1.0/#siret'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'siren',
    title: {
      fr: 'SIREN',
      en: ''
    },
    description: {
      fr: "Le numéro SIREN est un identifiant numérique d'entreprise (9 chiffres)",
      en: ''
    },
    identifiers: [
      'http://dbpedia.org/ontology/siren'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'codeAPE',
    title: {
      fr: 'Code APE',
      en: ''
    },
    description: {
      fr: "Le code APE (activité principale exercée) permet d'identifier la branche d'activité principale de l'entreprise ou du travailleur indépendant en référence à la nomenclature des activités françaises",
      en: ''
    },
    identifiers: [
      'http://www.datatourisme.fr/ontology/core/1.0#apeNaf'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'cjNiveau3',
    title: {
      fr: 'Catégorie juridique (niveau 3)',
      en: ''
    },
    description: {
      fr: "La catégorie juridique de niveau 3, parfois appelée nature juridique est un code sur 4 caractères numériques. Elle est issue d'une nomenclature de l'état Français.",
      en: ''
    },
    identifiers: [
      'http://id.insee.fr/concepts/cj/cjNiveauIII'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'idBV',
    title: {
      fr: 'Identifiant de bureau de vote',
      en: ''
    },
    description: {
      fr: "Identifiant unique national d'un bureau de vote constitué de la concaténation du code INSEE de la commune d'un tiret bas et du code du bureau de vote. Cette information est issue du Répertoire Électoral Unique (REU).",
      en: ''
    },
    identifiers: [
      'https://www.insee.fr/fr/information/3539086/idBV'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'date',
    title: {
      fr: "Date d'évènement",
      en: 'Event date'
    },
    description: {
      fr: "Date d'un événement ponctuel sans durée définie",
      en: 'Date of a one-off event without known duration'
    },
    identifiers: [
      'http://schema.org/Date',
      'http://purl.org/dc/identifierss/date'
    ],
    type: 'string',
    format: 'date-time',
    tag: {
      fr: 'Calendrier',
      en: 'Calendar'
    }
  },
  {
    id: 'codeParcelle',
    title: {
      fr: 'Code parcelle',
      en: ''
    },
    description: {
      fr: 'Le code de la parcelle cadastrale est le numéro unique attribué par le Service du cadastre pour identifier une parcelle cadastrale au niveau national',
      en: ''
    },
    identifiers: [
      'http://dbpedia.org/ontology/codeLandRegistry'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'geometry',
    title: {
      fr: 'Géométrie GeoJSON ou WKT',
      en: 'GeoJSON or WKT geometry'
    },
    description: {
      fr: 'Une géométrie (point, polygone, ligne, etc.) au format GeoJSON ou WKT.',
      en: 'A geometry (point, polygon, line, etc.) in the GeoJSON or WKT format'
    },
    identifiers: [
      'https://purl.org/geojson/vocab#geometry'
    ],
    type: 'string',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'attachment',
    title: {
      fr: 'Document numérique attaché',
      en: 'Attachment'
    },
    description: {
      fr: "Chemin relatif vers un fichier rattaché au jeu de données ou URL vers un fichier hébergé à l'extérieur",
      en: 'Relative path to an attached file of the dataset or URL to a file hosted externally'
    },
    identifiers: [
      'http://schema.org/DigitalDocument'
    ],
    type: 'string',
    tag: {
      fr: 'Liens',
      en: 'Links'
    }
  }, {
    id: 'webPage',
    title: {
      fr: 'Page Web',
      en: 'Web page'
    },
    description: {
      fr: "URL d'une page Web externe",
      en: 'URL of an external Web page'
    },
    identifiers: [
      'https://schema.org/WebPage'
    ],
    type: 'string',
    tag: {
      fr: 'Liens',
      en: 'Links'
    }
  }, {
    id: 'email',
    title: {
      fr: 'Adresse e-mail',
      en: 'Email address'
    },
    description: {
      fr: 'Adresse e-mail ou URI de type mailto',
      en: 'Email address or mailto URI'
    },
    identifiers: [
      'https://www.w3.org/2006/vcard/ns#email'
    ],
    type: 'string',
    tag: {
      fr: 'Informations de contact',
      en: 'Contact information'
    }
  }, {
    id: 'tel',
    title: {
      fr: 'N° de téléphone',
      en: 'Phone number'
    },
    description: {
      fr: 'Un numéro de téléphone',
      en: 'A phone number'
    },
    identifiers: [
      'https://www.w3.org/2006/vcard/ns#tel'
    ],
    type: 'string',
    tag: {
      fr: 'Informations de contact',
      en: 'Contact information'
    }
  },
  {
    id: 'coordX',
    title: {
      fr: 'Coordonnée X',
      en: 'X coordinate'
    },
    description: {
      fr: 'Coordonnée géographique X (Easting) selon une projection à définir sur le jeu de données. Cette information sera utilisée pour calculer les attributs latitude/longitude.',
      en: 'Geographic coordinate X (Easting) based on a projection defined on the dataset. This information will be used to calculate latitude/longitude properties.'
    },
    identifiers: [
      'http://data.ign.fr/def/geometrie#coordX'
    ],
    type: 'number',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'coordY',
    title: {
      fr: 'Coordonnée Y (projection libre)',
      en: 'Y coordinate (custom projection)'
    },
    description: {
      fr: 'Coordonnée géographique Y (Northing) selon une projection à définir sur le jeu de données. Cette information sera utilisée pour calculer les attributs latitude/longitude.',
      en: 'Geographic coordinate Y (Northing) based on a projection defined on the dataset. This information will be used to calculate latitude/longitude properties.'
    },
    identifiers: [
      'http://data.ign.fr/def/geometrie#coordY'
    ],
    type: 'number',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'geometryProj',
    title: {
      fr: 'Géométrie GeoJSON ou WKT (projection libre)',
      en: 'GeoJSON or WKT geometry (custom projection)'
    },
    description: {
      fr: 'Une géométrie (point, polygone, ligne, etc.) au format GeoJSON ou WKT selon une projection à définir sur le jeu de données. Cette information sera utilisée pour calculer une géométrie dans la projection WGS 84.',
      en: 'A geometry (point, polygon, line, etc.) in the GeoJSON or WKT format based on a projection defined on the dataset. This information will be used to calculate a geometry on the WGS 84 projection.'
    },
    identifiers: [
      'http://data.ign.fr/def/geometrie#Geometry'
    ],
    type: 'string',
    tag: {
      fr: 'Géographie',
      en: 'Geography'
    }
  },
  {
    id: 'startDate',
    title: {
      fr: 'Date de début',
      en: 'Start date'
    },
    description: {
      fr: 'Permet de décrire un évènement daté avec un début et une fin',
      en: 'Used to describe a timed event with a start and end'
    },
    identifiers: [
      'https://schema.org/startDate'
    ],
    type: 'string',
    format: 'date-time',
    tag: {
      fr: 'Calendrier',
      en: 'Calendar'
    }
  },
  {
    id: 'endDate',
    title: {
      fr: 'Date de fin',
      en: 'End date'
    },
    description: {
      fr: 'Permet de décrire un évènement daté avec un début et une fin',
      en: 'Used to describe a timed event with a start and end'
    },
    identifiers: [
      'https://schema.org/endDate'
    ],
    type: 'string',
    format: 'date-time',
    tag: {
      fr: 'Calendrier',
      en: 'Calendar'
    }
  },
  {
    id: 'dateCreated',
    title: {
      fr: 'Date de création',
      en: 'Creation date'
    },
    description: {
      fr: 'Date à laquelle a été créée la ressource',
      en: 'Date when the resource was created'
    },
    identifiers: [
      'http://schema.org/dateCreated',
      'http://purl.org/dc/identifierss/created'
    ],
    type: 'string',
    format: 'date-time',
    tag: {
      fr: 'Calendrier',
      en: 'Calendar'
    }
  },
  {
    id: 'openingHours',
    title: {
      fr: "Horaires d'ouverture",
      en: 'Opening hours'
    },
    description: {
      fr: "Permet de préciser les horaires d'ouverture hebdomadaires d'un établissement.",
      en: 'Used to get the opening hours of an establishment'
    },
    identifiers: [
      'https://schema.org/openingHours'
    ],
    type: 'string',
    tag: {
      fr: 'Calendrier',
      en: 'Calendar'
    }
  },
  {
    id: 'price',
    title: {
      fr: 'Prix',
      en: 'Price'
    },
    description: {
      fr: "Le prix de vente d'un bien ou d'un service.",
      en: 'The retail price of a product or service.'
    },
    identifiers: [
      'https://schema.org/price'
    ],
    type: 'number',
    tag: {
      fr: 'Commerce',
      en: 'Commerce'
    }
  },
  {
    id: 'qpv',
    title: {
      fr: 'Quartier prioritaire (QPV)',
      en: 'Priority district (QPV)'
    },
    description: {
      fr: 'Quartiers prioritaires de la politique de la ville (QPV) selon les termes de la loi de programmation pour la Ville et la cohésion urbaine du 21 février 2014.',
      en: 'Priority districts according to french law.'
    },
    identifiers: [
      'https://sig.ville.gouv.fr/qpv'
    ],
    type: 'string',
    tag: {
      fr: 'Référentiels administratifs français',
      en: 'French administrative master-data'
    }
  },
  {
    id: 'attendeeCapacity',
    title: {
      fr: 'Capacité de participants',
      en: 'Attendee capacity'
    },
    description: {
      fr: 'Capacité maximale de participants à un évènement.',
      en: 'Maximum physical attendee capacity of an event.'
    },
    identifiers: [
      'https://schema.org/maximumPhysicalAttendeeCapacity'
    ],
    type: 'string',
    tag: {
      fr: 'Évènements',
      en: 'Events'
    }
  },
  {
    id: 'accountRef',
    title: {
      fr: 'Référence à un compte',
      en: 'Reference to an account'
    },
    description: {
      fr: "Une référence à un compte de cette plateforme, le format est 'organization:idOrg:idDep' par exemple.",
      en: "A reference to an account from this platform, format is 'organization:idOrg:idDep' for example."
    },
    identifiers: [
      'https://github.com/data-fair/lib/account'
    ],
    type: 'string',
    tag: {
      fr: 'Plateforme',
      en: 'Platform'
    }
  }
]
