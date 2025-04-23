// examples of urls
// https://services-eu1.arcgis.com/gONSMkhTYE5RuOwN/ArcGIS
// https://sig.grandpoitiers.fr/arcgis2/rest/services

import { httpError } from '@data-fair/lib-utils/http-errors.js'
import memoize from 'memoizee'
import axios from '../../misc/utils/axios.js'
import debugLib from 'debug'

const debug = debugLib('catalogs:arcgis')

export const title = 'ArcGIS REST Services'
export const description = ''
export const docUrl = 'https://developers.arcgis.com/rest/'
export const optionalCapabilities = [
  'listDatasets',
  'autoUpdate'
]

const memoizedFetch = memoize(async (url) => {
  return (await axios.get(url, { params: { f: 'json' } })).data
}, {
  profileName: 'arcgisFetch',
  primitive: true,
  promise: true,
  max: 100,
  maxAge: 1000 * 60 * 5 // 5 minutes
})

/**
 * @param {string} catalogUrl
 */
export const init = async (catalogUrl) => {
  debug('try fetching ArcGIS catalog', catalogUrl)
  const url = new URL(catalogUrl)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  if (!url.pathname.endsWith('/rest/services/')) url.pathname += 'rest/services/'
  const rootData = await memoizedFetch(url.href)
  if (typeof rootData !== 'object') throw new Error('ArcGIS services should return JSON')
  if (!Array.isArray(rootData.services) && !Array.isArray(rootData.folders)) throw new Error('ArcGIS services should return a list of services or folders')
  return { url: url.href, title: new URL(catalogUrl).host }
}

export const httpParams = async (catalog) => {
  return {}
}

export const searchOrganizations = async (catalogUrl, q) => {
  throw httpError(501, 'La récupération d\'une liste d\'organisations depuis API ArcGIS n\'est pas disponible')
}

export const publishDataset = async (catalog, dataset, publication) => {
  throw httpError(501, 'La publication de jeux de données vers API ArcGIS n\'est pas disponible')
}

export const deleteDataset = async (catalog, dataset, publication) => {
  throw httpError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

export const publishApplication = async (catalog, application, publication, datasets) => {
  throw httpError(501, 'La publication d\'applications vers API ArcGIS n\'est pas disponible')
}

export const deleteApplication = async (catalog, application, publication) => {
  throw httpError(501, 'La dépublication d\'applications vers API ArcGIS n\'est pas disponible')
}

export const listDatasets = async (catalog, p) => {
  const rootData = (await memoizedFetch(catalog.url))
  const services = rootData.services ? [...rootData.services] : []
  if (rootData.folders) {
    for (const folder of rootData.folders) {
      debug('get folder', folder)
      const folderData = await memoizedFetch(catalog.url + folder)
      if (folderData.services) services.push(...folderData.services)
    }
  }
  const datasets = []
  for (const service of services) {
    if (service.type === 'FeatureServer' || service.type === 'MapServer') {
      const serviceUrl = service.url ?? (catalog.url + service.name + '/' + service.type)
      debug('get service info', serviceUrl)
      const featureServer = await memoizedFetch(serviceUrl)
      for (const layer of featureServer.layers ?? []) {
        const layerUrl = serviceUrl + '/' + layer.id
        const dataset = {
          id: `${service.id ?? service.name.replace('/', '-')}-${layer.id}`,
          title: `${service.name} (${service.type}) - ${layer.name}`,
          page: layerUrl,
          resources: [{
            id: 'geojson',
            title: layer.name + ' GeoJSON',
            url: layerUrl + '/query?f=geojson&outFields=*&where=shape+is+not+null',
            format: 'geojson',
            mime: 'application/geo+json'
          }]
        }
        datasets.push(dataset)
      }
    }
  }
  return { count: datasets.length, results: datasets }
}

export const getDataset = async (catalog, datasetId) => {
  const datasetList = (await listDatasets(catalog, null)).results
  const dataset = datasetList.find(d => d.id === datasetId)
  if (!dataset) return
  const extendedInfo = await memoizedFetch(dataset.page)
  dataset.description = extendedInfo.description
  // TODO: image, license, keywords, etc
  return dataset
}

export const prepareResourceDatasetHarvest = async (newDataset, catalog, dataset, resource) => {
  newDataset.extras = {
    fixGeojsonESRI: true
  }
}
