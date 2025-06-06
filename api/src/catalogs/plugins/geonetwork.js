// this type of catalog can be tested using this URL as an example:
// https://geocatalogue.lannion-tregor.com/geonetwork/

import { httpError } from '@data-fair/lib-utils/http-errors.js'
import axios from '../../misc/utils/axios.js'
import { findLicense } from '../../misc/utils/licenses.js'
import debugLib from 'debug'

const debug = debugLib('catalogs:geonetwork')

export const title = 'GeoNetwork'
export const description = ''
export const docUrl = 'https://geonetwork-opensource.org/'
export const optionalCapabilities = [
  'listDatasets',
  'autoUpdate'
]

export const init = async (catalogUrl) => {
  const siteUrl = new URL('srv/api/0.1/site', catalogUrl)
  debug('try fetching geonetwork info', siteUrl)
  const site = (await axios.get(siteUrl)).data
  if (!site['system/site/name']) throw new Error('missing system/site/name in geonetwork site info')
  return { url: catalogUrl, title: site['system/site/name'] + ' - ' + site['system/site/organization'] }
}

export const httpParams = async (catalog) => {
  return {}
}

export const searchOrganizations = async (catalogUrl, q) => {
  throw httpError(501, 'La récupération d\'une liste d\'organisations depuis GeoNetwork n\'est pas disponible')
}

export const publishDataset = async (catalog, dataset, publication) => {
  throw httpError(501, 'La publication de jeux de données vers GeoNetwork n\'est pas disponible')
}

export const deleteDataset = async (catalog, dataset, publication) => {
  throw httpError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

export const publishApplication = async (catalog, application, publication, datasets) => {
  throw httpError(501, 'La publication d\'applications vers GeoNetwork n\'est pas disponible')
}

export const deleteApplication = async (catalog, application, publication) => {
  throw httpError(501, 'La dépublication d\'applications vers GeoNetwork n\'est pas disponible')
}

export const listDatasets = async (catalog, p) => {
  // RDF approach using public API would be better but I don't see the way to construct links to shapefiles
  // const res = await axios.get(url.resolve(catalog.url, 'srv/api/0.1/records'), { params: { any: params.q, hitsPerPage: 1 } })
  // const datasets = this.rdf2datasets(res.data)

  // https://geocatalogue.lannion-tregor.com/geonetwork/srv/fre/q?_content_type=json&bucket=s101&facet.q=&fast=index&from=1&resultType=details&sortBy=relevance&sortOrder=&to=20
  const params = {
    _content_type: 'json',
    // bucket: 's101'
    fast: 'index',
    from: 1,
    to: 100,
    resultType: 'details',
    sortBy: 'relevance'
  }
  if (p.q) params.any = p.q
  const res = await axios.get(new URL('srv/fre/q', catalog.url).href, { params })
  const count = res.data.summary['@count']
  const items = Array.isArray(res.data.metadata) ? res.data.metadata : [res.data.metadata]
  return { count, results: items.map(item => prepareDatasetFromCatalog(catalog, item)) }
}

export const getDataset = async (catalog, datasetId, settings) => {
  // https://geocatalogue.lannion-tregor.com/geonetwork/srv/fre/q?_content_type=json&_draft=y+or+n+or+e&_isTemplate=y+or+n&fast=index&uuid=0cf415ff-8334-4658-97f8-c8ca6729fbb8
  const params = {
    _content_type: 'json',
    fast: 'index',
    uuid: datasetId
  }
  const res = await axios.get(new URL('srv/fre/q', catalog.url).href, { params })
  // console.log(JSON.stringify(res.data.metadata, null, 2))
  return prepareDatasetFromCatalog(catalog, res.data.metadata, settings)
}

/*
import xml2js from 'xml-js'
import url from 'url';
import { httpError } from '@data-fair/lib-utils/http-errors.js';
import axios from '../../misc/utils/axios.js';
import { findLicense } from '../../misc/utils/licenses.js';
import debugLib from 'debug';
export const rdf2datasets = (rdf) => {
  const content = xml2js(rdf, { compact: true })
  const catalogRecords = content['rdf:RDF']['dcat:Catalog']['dcat:dataset']
    .filter(item => !!item['dcat:CatalogRecord'])
    .map(item => item['dcat:CatalogRecord'])
  console.log('catalogRecord', JSON.stringify(catalogRecords[0], null, 2))
  const distributions = content['rdf:RDF']['dcat:Catalog']['dcat:dataset']
    .filter(item => !!item['dcat:Distribution'])
    .map(item => item['dcat:Distribution'])
  console.log('distribution', JSON.stringify(distributions[0], null, 2))
  const datasets = content['rdf:RDF']['dcat:Catalog']['dcat:dataset']
    .filter(item => !!item['dcat:Dataset'])
    .map(item => item['dcat:Dataset'])
  console.log('dataset', JSON.stringify(datasets[0], null, 2))
  return []
}
*/

// from inspire https://inspire.ec.europa.eu/metadata-codelist/MaintenanceFrequency
// to dublin core https://www.dublincore.org/specifications/dublin-core/collection-description/frequency/
const updateFrequenciesMap = {
  annually: 'annual',
  asNeeded: 'irregular',
  biannually: 'semiannual',
  continual: 'continuous',
  daily: 'daily',
  fortnightly: 'semimonthly',
  irregular: 'irregular',
  monthly: 'monthly',
  notPlanned: '',
  quarterly: 'quarterly',
  unknown: '',
  weekly: 'weekly'
}

function prepareDatasetFromCatalog (catalog, item, settings) {
  const link = Array.isArray(item.link) ? item.link : [item.link]
  const page = new URL(`srv/fre/catalog.search#/metadata/${item['geonet:info'].uuid}`, catalog.url).href
  const keywords = (Array.isArray(item.keyword) ? item.keyword : [item.keyword]).filter(k => !!k)
  const legalConstraints = (Array.isArray(item.legalConstraints) ? item.legalConstraints : [item.legalConstraints]).filter(k => !!k)
  const dataset = {
    id: item['geonet:info'].uuid,
    createdAt: item.creationDate,
    title: item.title,
    description: item.abstract,
    page,
    keywords,
    // private: false,
    resources: link.map(l => {
      if (!l) return null
      const [key, title, url, type] = l.split('|')
      if (type !== 'OGC:WFS') return null
      const shapefileUrl = new URL(url)
      // example:
      // https://geoserver.lannion-tregor.com/geoserver/opendata/wfs?service=wfs&request=GetFeature&typeName=opendata:vm_littoral_mer_rvb_ta&outputformat=shape-zip
      shapefileUrl.searchParams.set('service', 'wfs')
      shapefileUrl.searchParams.set('request', 'GetFeature')
      shapefileUrl.searchParams.set('typeName', key)
      shapefileUrl.searchParams.set('outputformat', 'shape-zip')
      return {
        id: key,
        format: 'shapefile',
        mime: 'application/zip',
        title,
        url: shapefileUrl.href
      }
    }).filter(l => !!l)
  }
  const image = Array.isArray(item.image) ? item.image : [item.image]
  const thumbnail = image.find(i => !!i && i.startsWith('thumbnail|'))
  if (thumbnail) {
    dataset.image = thumbnail.split('|')[1]
  }
  if (item.updateFrequency) {
    // debug(`match updateFrequency ${item.updateFrequency} -> ${updateFrequenciesMap[item.updateFrequency]}`)
    if (updateFrequenciesMap[item.updateFrequency]) {
      dataset.frequency = updateFrequenciesMap[item.updateFrequency]
    }
  }

  if (settings && settings.licenses) {
    for (const lc of legalConstraints) {
      const license = findLicense(lc, settings.licenses)
      if (license) {
        debug('match legalConstraints to licenses', legalConstraints, settings.licenses, license)
        dataset.license = license
        break
      }
    }
  }

  return dataset
}
