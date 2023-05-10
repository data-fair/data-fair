// this type of catalog can be tested using this URL as an example:
// https://geocatalogue.lannion-tregor.com/geonetwork/

const url = require('url')
const createError = require('http-errors')
const axios = require('../utils/axios')

const debug = require('debug')('catalogs:geonetwork')

exports.title = 'GeoNetwork'
exports.description = ''
exports.docUrl = 'https://geonetwork-opensource.org/'
exports.optionalCapabilities = [
  'listDatasets'
]

exports.init = async (catalogUrl) => {
  const siteUrl = url.resolve(catalogUrl, 'srv/api/0.1/site')
  debug('try fetching geonetwork info', siteUrl)
  const site = (await axios.get(siteUrl)).data
  return { url: catalogUrl, title: site['system/site/name'] + ' - ' + site['system/site/organization'] }
}

exports.searchOrganizations = async (catalogUrl, q) => {
  throw createError(501, 'La récupération d\'une liste d\'organisations depuis GeoNetwork n\'est pas disponible')
}

exports.publishDataset = async (catalog, dataset, publication) => {
  throw createError(501, 'La publication de jeux de données vers GeoNetwork n\'est pas disponible')
}

exports.deleteDataset = async (catalog, dataset, publication) => {
  throw createError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

exports.publishApplication = async (catalog, application, publication, datasets) => {
  throw createError(501, 'La publication d\'applications vers GeoNetwork n\'est pas disponible')
}

exports.deleteApplication = async (catalog, application, publication) => {
  throw createError(501, 'La dépublication d\'applications vers GeoNetwork n\'est pas disponible')
}

exports.listDatasets = async (catalog, p) => {
  // RDF approach using public API would be better but I don't see the way to construct links to shapefiles
  // const res = await axios.get(url.resolve(catalog.url, 'srv/api/0.1/records'), { params: { any: params.q, hitsPerPage: 1 } })
  // const datasets = this.rdf2datasets(res.data)

  // https://geocatalogue.lannion-tregor.com/geonetwork/srv/fre/q?_content_type=json&bucket=s101&facet.q=&fast=index&from=1&resultType=details&sortBy=relevance&sortOrder=&to=20
  const params = {
    _content_type: 'json',
    // bucket: 's101'
    fast: 'index',
    from: 1,
    to: 20,
    resultType: 'details',
    sortBy: 'relevance'
  }
  if (p.q) params.any = p.q
  const res = await axios.get(url.resolve(catalog.url, 'srv/fre/q'), { params })
  const count = res.data.summary['@count']
  const items = Array.isArray(res.data.metadata) ? res.data.metadata : [res.data.metadata]
  return { count, results: items.map(prepareDatasetFromCatalog) }
}

exports.getDataset = async (catalog, datasetId) => {
  // https://geocatalogue.lannion-tregor.com/geonetwork/srv/fre/q?_content_type=json&_draft=y+or+n+or+e&_isTemplate=y+or+n&fast=index&uuid=0cf415ff-8334-4658-97f8-c8ca6729fbb8
  const params = {
    _content_type: 'json',
    fast: 'index',
    uuid: datasetId
  }
  const res = await axios.get(url.resolve(catalog.url, 'srv/fre/q'), { params })
  return prepareDatasetFromCatalog(res.data.metadata)
}

exports.harvestDataset = async (catalog, datasetId, req) => {
  throw createError(501, 'La récupération d\'une définition de jeu de données depuis GeoNetwork n\'est pas disponible')
}

/*
const { xml2js } = require('xml-js')
exports.rdf2datasets = (rdf) => {
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

function prepareDatasetFromCatalog (item) {
  const link = Array.isArray(item.link) ? item.link : [item.link]
  const dataset = {
    id: item['geonet:info'].uuid,
    createdAt: item.creationDate,
    title: item.title,
    // page: d.page,
    private: false,
    resources: link.map(l => {
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
        title: title,
        url: shapefileUrl.href
      }
    }).filter(l => !!l)
  }
  return dataset
}
