const jsonld = require('jsonld')
const context = require('./context')

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
      simplifyIds(dataset, ['accrualPeriodicity', 'landingPage', 'language', 'theme', 'spatial', 'temporal'])
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
      if (dataset.temporal && typeof dataset.temporal === 'object' && dataset.temporal.startDate && dataset.temporal.endDate) {
        dataset.temporal = dataset.temporal.startDate + '/' + dataset.temporal.endDate
      }
      if (dataset.temporal) {
        simplifyValues(dataset.temporal, ['startDate', 'endDate'])
      }
    }
  }
  return dcat
}
