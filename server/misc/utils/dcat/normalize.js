const jsonld = require('jsonld')

// the context defines the referenced vocabularies and their short aliases
// when using jsonld.compact these short aliases are applied
// inspired by https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.jsonld
/** @type {import('jsonld').ContextDefinition} */
const context = {
  dcat: 'http://www.w3.org/ns/dcat#',
  org: 'http://www.w3.org/ns/org#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  '@vocab': 'http://www.w3.org/ns/dcat#',
  dc: 'http://purl.org/dc/terms/',
  pod: 'https://project-open-data.cio.gov/v1.1/schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  describedBy: {
    '@id': 'http://www.w3.org/2007/05/powder#describedby',
    '@type': '@id'
  },
  downloadURL: {
    '@id': 'dcat:downloadURL',
    '@type': '@id'
  },
  accessURL: {
    '@id': 'dcat:accessURL',
    '@type': '@id'
  },
  title: 'dc:title',
  description: 'dc:description',
  issued: {
    '@id': 'dc:issued',
    '@type': 'http://www.w3.org/2001/XMLSchema#date'
  },
  modified: {
    '@id': 'dc:modified',
    '@type': 'http://www.w3.org/2001/XMLSchema#date'
  },
  language: 'dc:language',
  license: 'dc:license',
  rights: 'dc:rights',
  spatial: 'dc:spatial',
  conformsTo: {
    '@id': 'dc:conformsTo',
    '@type': '@id'
  },
  publisher: 'dc:publisher',
  identifier: 'dc:identifier',
  temporal: 'dc:temporal',
  format: 'dc:format',
  accrualPeriodicity: 'dc:accrualPeriodicity',
  homepage: 'foaf:homepage',
  accessLevel: 'pod:accessLevel',
  bureauCode: 'pod:bureauCode',
  dataQuality: 'pod:dataQuality',
  describedByType: 'pod:describedByType',
  primaryITInvestmentUII: 'pod:primaryITInvestmentUII',
  programCode: 'pod:programCode',
  fn: 'vcard:fn',
  hasEmail: 'vcard:email',
  name: 'skos:prefLabel',
  subOrganizationOf: 'org:subOrganizationOf',
  label: 'http://www.w3.org/2000/01/rdf-schema#label',
  startDate: 'http://schema.org/startDate',
  endDate: 'http://schema.org/endDate'
}

// Frame is used to control serialization of nested objects, prefered over a flat graph
/** @type {import('jsonld').NodeObject} */
const frame = {
  '@context': context,
  '@type': 'Catalog',
  dataset: {
    '@type': 'Dataset',
    distribution: {
      '@type': 'Distribution'
    },
    publisher: {
      '@type': 'Distribution'
    }
  }
}

// TODO: replace frame algorithm with method resolveIds

/**
 * @param {any} obj
 * @param {string[]} keys
 */
const ensureArrays = (obj, keys) => {
  for (const key of keys) {
    if (obj[key] && !Array.isArray(obj[key])) {
      obj[key] = [obj[key]]
    }
  }
}

/**
 * @param {any} obj
 * @param {string[]} keys
 */
const simplifyIds = (obj, keys) => {
  for (const key of keys) {
    if (obj[key]?.['@id']) obj[key] = obj[key]['@id']
  }
}

/**
 * @param {any} obj
 * @param {string[]} keys
 */
const simplifyLabels = (obj, keys) => {
  for (const key of keys) {
    if (obj[key]?.label) obj[key] = obj[key].label
  }
}

/**
 * @param {any} obj
 * @param {string[]} keys
 */
const simplifyValues = (obj, keys) => {
  for (const key of keys) {
    if (obj[key]?.['@value']) obj[key] = obj[key]['@value']
  }
}

/**
 * @param {any} obj
 * @param {string[]} keys
 */
const simplifyI18n = (obj, keys) => {
  for (const key of keys) {
    if (obj[key]?.['@language'] && obj[key]?.['@value']) obj[key] = obj[key]['@value']
  }
}

/**
 * @param {any} dcat
 */
module.exports = async (dcat) => {
  dcat = await jsonld.frame(dcat, frame)
  dcat = await jsonld.compact(dcat, context)
  dcat.conformsTo = 'https://project-open-data.cio.gov/v1.1/schema'
  dcat.describedBy = dcat.describedBy ?? 'https://project-open-data.cio.gov/v1.1/schema/catalog.json'
  simplifyI18n(dcat, ['title', 'description'])
  ensureArrays(dcat, ['dataset'])
  if (dcat.dataset) {
    for (const dataset of dcat.dataset) {
      simplifyIds(dataset, ['accrualPeriodicity', 'landingPage', 'language', 'theme'])
      ensureArrays(dataset, ['distribution', 'language', 'theme'])
      simplifyI18n(dataset, ['title', 'description'])
      simplifyLabels(dataset, ['spatial'])
      if (dataset.distribution) {
        for (const distribution of dataset.distribution) {
          simplifyIds(distribution, ['format', 'license', 'mediaType'])
          simplifyI18n(distribution, ['title', 'description'])
        }
      }
      if (dataset.publisher && dataset.publisher['@type'] === 'foaf:Agent') {
        dataset.publisher = {
          '@type': 'org:Organization',
          name: dataset.publisher['foaf:name']
        }
      }
      if (dataset.temporal && typeof dataset.temporal === 'string') {
        const parts = dataset.temporal.split('/')
        dataset.temporal = {
          '@type': 'dc:PeriodOfTime',
          startDate: parts[0],
          endDate: parts[1]
        }
      }
      if (dataset.temporal) {
        simplifyValues(dataset.temporal, ['startDate', 'endDate'])
      }
    }
  }
  return dcat
}
