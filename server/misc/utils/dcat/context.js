
// the context defines the referenced vocabularies and their short aliases
// when using jsonld.compact these short aliases are applied
// inspired by https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.jsonld
/** @type {import('jsonld').ContextDefinition} */
module.exports = {
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
