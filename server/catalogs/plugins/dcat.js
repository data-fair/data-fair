// this type of catalog can be tested using this URL as an example:
// https://geocatalogue.lannion-tregor.com/geonetwork/


import path from 'path'
import createError from 'http-errors'
import memoize from 'memoizee'
import mime from 'mime'
import slug from 'slugify'
import Piscina from 'piscina'
import validate from '../../misc/utils/dcat/validate.js'
import { findLicense } from '../../misc/utils/licenses.js'
import debugLib from 'debug'

const debug = debugLib('catalogs:dcat')

 export const title = 'DCAT - JSON-LD'
 export const description = ''
 export const docUrl = 'https://doc.data.gouv.fr/moissonnage/dcat/'
 export const optionalCapabilities = [
  'listDatasets',
  'autoUpdate'
]

const fetchDCATPiscina = new Piscina({
  filename: path.resolve(__dirname, '../threads/fetch-dcat.js'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

const memoizedGetDCAT = memoize(async (catalogUrl) => {
  const normalized = await fetchDCATPiscina.run(catalogUrl)
  // we don't make validation blocking as it might be too restrictive
  // but we log it to provide potentially useful indications
  if (!validate(normalized)) {
    console.error(`DCAT validation errors ${catalogUrl}`, validate.errors)
  }
  return normalized
}, {
  profileName: 'getDCAT',
  promise: true,
  primitive: true,
  max: 1000,
  maxAge: 1000 * 60 * 10 // 10 minute
})

/**
 * @param {string} catalogUrl
 */
 export const init = async (catalogUrl) => {
  debug('try fetching DCAT catalog', catalogUrl)
  const dcat = await memoizedGetDCAT(catalogUrl)
  if (typeof dcat !== 'object') throw new Error('DCAT should return JSON')
  if (!dcat['@context']) throw new Error('DCAT should return JSON-LD with a @context property.')
  if (dcat['@type'] !== 'dcat:Catalog' && dcat['@type'] !== 'Catalog') throw new Error('wrong @type in JSON-LD root.')
  return { url: catalogUrl, title: new URL(catalogUrl).host }
}

 export const httpParams = async (catalog) => {
  return {}
}

 export const searchOrganizations = async (catalogUrl, q) => {
  throw createError(501, 'La récupération d\'une liste d\'organisations depuis catalogue DCAT n\'est pas disponible')
}

 export const publishDataset = async (catalog, dataset, publication) => {
  throw createError(501, 'La publication de jeux de données vers catalogue DCAT n\'est pas disponible')
}

 export const deleteDataset = async (catalog, dataset, publication) => {
  throw createError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

 export const publishApplication = async (catalog, application, publication, datasets) => {
  throw createError(501, 'La publication d\'applications vers catalogue DCAT n\'est pas disponible')
}

 export const deleteApplication = async (catalog, application, publication) => {
  throw createError(501, 'La dépublication d\'applications vers catalogue DCAT n\'est pas disponible')
}

 export const listDatasets = async (catalog, p, settings) => {
  const dcat = await memoizedGetDCAT(catalog.url)
  let indexDataset = 0
  const datasets = dcat.dataset?.map(d => {
    indexDataset += 1
    return prepareDatasetFromCatalog(catalog, d, settings, indexDataset)
  }) ?? []
  return { count: datasets.length, results: datasets }
}

 export const getDataset = async (catalog, datasetId, settings) => {
  return (await  export const listDatasets(catalog, null, settings)).results.find(d => d.id === datasetId)
}

function prepareDatasetFromCatalog (catalog, item, settings, indexDataset) {
  // page is an important property for us, it cannot be absent
  let page = item.landingPage
  if (!page) {
    if (item.identifier && (item.identifier.startsWith('http://') || item.identifier.startsWith('https://'))) {
      page = item.identifier
    } else {
      page = catalog.url + '/dataset/' + item.identifier
    }
  }

  const dataset = {
    id: slug(item.identifier ?? '' + indexDataset, { lower: true, strict: true }),
    title: item.title,
    description: item.description,
    creationDate: item.issued,
    keywords: item.keyword,
    page
  }
  if (item.license) {
    if (settings && settings.licenses) {
      const license = findLicense(item.license, settings.licenses)
      if (license) dataset.license = license
    }
  }
  if (item.accrualPeriodicity) dataset.frequency = item.accrualPeriodicity.replace('http://purl.org/cld/freq/', '')
  if (item.distribution) {
    let indexDistrib = 0
    dataset.resources = item.distribution.map(distrib => {
      indexDistrib++
      const resource = {
        id: slug(distrib.identifier ?? '' + indexDistrib, { lower: true, strict: true }),
        title: distrib.title,
        format: distrib.format,
        mime: distrib.mediaType,
        url: distrib.downloadURL
      }
      if (resource.format && !resource.mime) resource.mime = mime.lookup(resource.format)
      return resource
    })
  }

  return dataset
}
