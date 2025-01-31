import jsonld from 'jsonld'
import context from './context.js'
import * as convert from './convert.js'

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
      '@type': 'org:Organization'
    }
  }
}

// TODO: replace frame algorithm with method resolveIds ?

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
const simplifyI18n = (obj, keys) => {
  for (const key of keys) {
    if (obj[key]?.['@language'] && obj[key]?.['@value']) obj[key] = obj[key]['@value']
  }
}

const simplifyType = (obj) => {
  if (obj['@type'] && Array.isArray(obj['@type'])) obj['@type'] = obj['@type'][0]
}

const removePrefix = (obj, key, prefix) => {
  if (obj[key] && typeof obj[key] === 'string' && obj[key].startsWith(prefix)) {
    obj[key] = obj[key].slice(prefix.length)
  }
}

/**
 * @param {any} dcat
 * @param {string} baseIRI
 */
export default async (dcat, baseIRI) => {
  if (typeof dcat === 'string') dcat = await convert.fromXML(dcat, baseIRI)
  dcat = await jsonld.frame(dcat, frame)
  dcat = await jsonld.compact(dcat, context)
  dcat.conformsTo = 'https://project-open-data.cio.gov/v1.1/schema'
  dcat.describedBy = dcat.describedBy ?? 'https://project-open-data.cio.gov/v1.1/schema/catalog.json'
  simplifyType(dcat)
  simplifyI18n(dcat, ['title', 'description'])
  ensureArrays(dcat, ['dataset'])
  if (dcat.dataset) {
    for (const dataset of dcat.dataset) {
      simplifyType(dataset)
      simplifyIds(dataset, ['accrualPeriodicity', 'landingPage', 'language', 'theme', 'spatial', 'temporal', 'license', 'rights'])
      ensureArrays(dataset, ['distribution', 'language', 'theme'])
      if (dataset.theme) simplifyIds(dataset.theme, Object.keys(dataset.theme))
      simplifyI18n(dataset, ['title', 'description'])
      simplifyLabels(dataset, ['spatial'])
      ensureArrays(dataset, ['keyword'])
      if (dataset.keyword) simplifyI18n(dataset.keyword, Object.keys(dataset.keyword))
      if (dataset.distribution) {
        for (const distribution of dataset.distribution) {
          simplifyType(distribution)
          simplifyIds(distribution, ['format', 'license', 'mediaType'])
          simplifyI18n(distribution, ['title', 'description'])
          removePrefix(distribution, 'format', 'https://www.iana.org/assignments/media-types/')
          removePrefix(distribution, 'mediaType', 'https://www.iana.org/assignments/media-types/')
        }
      }
      if (dataset.publisher && dataset.publisher['@type'] === 'foaf:Agent') {
        dataset.publisher = {
          '@type': 'org:Organization',
          name: dataset.publisher['foaf:name']
        }
      }
      if (dataset.temporal && typeof dataset.temporal === 'object' && dataset.temporal.startDate && dataset.temporal.endDate) {
        dataset.temporal = dataset.temporal.startDate + '/' + dataset.temporal.endDate
      }
    }
  }
  return dcat
}
