// the context defines the referenced vocabularies and their short aliases
// when using jsonld.compact these short aliases are applied
// inspired by https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.jsonld
/** @type {import('jsonld').ContextDefinition} */
export default {
  dcat: 'http://www.w3.org/ns/dcat#',
  org: 'http://www.w3.org/ns/org#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  '@vocab': 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
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
  title: 'dct:title',
  description: 'dct:description',
  issued: {
    '@id': 'dct:issued',
    '@type': 'http://www.w3.org/2001/XMLSchema#date'
  },
  modified: {
    '@id': 'dct:modified',
    '@type': 'http://www.w3.org/2001/XMLSchema#date'
  },
  language: 'dct:language',
  license: 'dct:license',
  rights: 'dct:rights',
  spatial: 'dct:spatial',
  conformsTo: {
    '@id': 'dct:conformsTo',
    '@type': '@id'
  },
  publisher: 'dct:publisher',
  identifier: 'dct:identifier',
  temporal: 'dct:temporal',
  format: 'dct:format',
  mediaType: 'dcat:mediaType',
  bytesSize: 'dcat:bytesSize',
  accrualPeriodicity: 'dct:accrualPeriodicity',
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
