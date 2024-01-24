// this type of catalog can be tested using this URL as an example:
// https://geocatalogue.lannion-tregor.com/geonetwork/

const url = require('url')
const createError = require('http-errors')
const axios = require('../../misc/utils/axios')

const debug = require('debug')('catalogs:geonetwork')

exports.title = 'GeoNetwork'
exports.description = ''
exports.docUrl = 'https://geonetwork-opensource.org/'
exports.optionalCapabilities = [
  'listDatasets',
  'autoUpdate'
]

exports.init = async (catalogUrl) => {
  const siteUrl = url.resolve(catalogUrl, 'srv/api/0.1/site')
  debug('try fetching geonetwork info', siteUrl)
  const site = (await axios.get(siteUrl)).data
  if (!site['system/site/name']) throw new Error('missing system/site/name in geonetwork site info')
  return { url: catalogUrl, title: site['system/site/name'] + ' - ' + site['system/site/organization'] }
}

exports.httpParams = async (catalog) => {
  return {}
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
    to: 100,
    resultType: 'details',
    sortBy: 'relevance'
  }
  if (p.q) params.any = p.q
  const res = await axios.get(url.resolve(catalog.url, 'srv/fre/q'), { params })
  const count = res.data.summary['@count']
  const items = Array.isArray(res.data.metadata) ? res.data.metadata : [res.data.metadata]
  return { count, results: items.map(item => prepareDatasetFromCatalog(catalog, item)) }
}

exports.getDataset = async (catalog, datasetId, settings) => {
  // https://geocatalogue.lannion-tregor.com/geonetwork/srv/fre/q?_content_type=json&_draft=y+or+n+or+e&_isTemplate=y+or+n&fast=index&uuid=0cf415ff-8334-4658-97f8-c8ca6729fbb8
  const params = {
    _content_type: 'json',
    fast: 'index',
    uuid: datasetId
  }
  const res = await axios.get(url.resolve(catalog.url, 'srv/fre/q'), { params })
  // console.log(JSON.stringify(res.data.metadata, null, 2))
  return prepareDatasetFromCatalog(catalog, res.data.metadata, settings)
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
  const page = url.resolve(catalog.url, `srv/fre/catalog.search#/metadata/${item['geonet:info'].uuid}`)
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
        title: title,
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
    const license = settings.licenses.find(l => !!legalConstraints.find(lc => lc.includes(l.href)))
    debug('match legalConstraints to licenses', legalConstraints, settings.licenses, license)
    if (license) dataset.license = license
  }

  return dataset
}
