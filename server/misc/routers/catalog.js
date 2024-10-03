const express = require('express')
const createError = require('http-errors')
const i18n = require('i18n')
const asyncWrap = require('../utils/async-handler')
const findUtils = require('../utils/find')
const datasetUtils = require('../../datasets/utils')
const permissions = require('../../misc/utils/permissions')
const catalogApiDocs = require('../../../contract/site-catalog-api-docs')
const dcatContext = require('../utils/dcat/context')

const router = module.exports = express.Router()

router.use((req, res, next) => {
  if (req.mainPublicationSite) req.publicationSite = req.mainPublicationSite
  if (!req.publicationSite) {
    return next(createError(400, 'catalog API can only be used from a publication site, not the back-office'))
  }
  next()
})

router.get('/datasets', asyncWrap(async (req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  req.resourceType = 'datasets'

  const extraFilters = [{ publicationSites: `${req.publicationSite.type}:${req.publicationSite.id}` }]
  if (req.query.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (req.query.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (req.query.file === 'true') extraFilters.push({ file: { $exists: true } })

  const query = findUtils.query(req, i18n.getLocale(req), req.user, 'datasets', { topics: 'topics.id' }, false, extraFilters)
  const sort = findUtils.sort(req.query.sort || '-createdAt')
  const project = findUtils.project(req.query.select, [], req.query.raw === 'true')
  const [skip, size] = findUtils.pagination(req.query)

  const countPromise = req.query.count !== 'false' && datasets.countDocuments(query)
  const resultsPromise = size > 0 && datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray()
  const [count, results] = await Promise.all([countPromise, resultsPromise])
  for (const result of results) {
    datasetUtils.clean(req, result)
    delete result.publicationSites
    delete result.owner
  }
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []

  res.json(response)
}))

router.get('/api-docs.json', asyncWrap(async (req, res) => {
  const settings = await req.app.get('db').collection('settings')
    .findOne({ type: req.publicationSite.owner.type, id: req.publicationSite.owner.id }, { projection: { info: 1 } })
  res.json(catalogApiDocs(req.publicBaseUrl, req.publicationSite, (settings && settings.info) || {}))
}))

router.get('/dcat', asyncWrap(async (req, res) => {
  // mostly useful for harvesting by data.gouv.fr
  // cf https://doc.data.gouv.fr/moissonnage/dcat/

  // here is an example: https://github.com/SEMICeu/dcat-ap_validator/blob/master/pages/samples/sample-json-ld.jsonld

  // to test this endpoint from a local udata instance:
  // > docker exec -it data-fair-udata-1 bash
  // > nano /usr/local/lib/python3.7/site-packages/udata/commands/dcat.py
  // > nano /usr/local/lib/python3.7/site-packages/udata/harvest/backends/dcat.py
  // > udata dcat parse-url http://localhost:5601/data-fair/api/v1/catalog/dcat
  // > udata dcat parse-url https://opendata.staging-koumoul.com/data-fair/api/v1/catalog/dcat

  const query = {
    $and: [
      { publicationSites: `${req.publicationSite.type}:${req.publicationSite.id}` },
      { $or: permissions.filter(req.user, 'datasets') }
    ]
  }

  // TODO: pagination ?

  const datasets = await req.app.get('db').collection('datasets')
    .find(query)
    .limit(10000)
    .project({
      _id: 0,
      id: 1,
      title: 1,
      description: 1,
      keywords: 1,
      license: 1,
      temporal: 1,
      frequency: 1,
      createdAt: 1,
      updatedAt: 1,
      dataUpdatedAt: 1,
      file: 1,
      originalFile: 1
    })
    .toArray()

  const dcatDatasets = []

  const datasetUrlTemplate = req.publicationSite.datasetUrlTemplate || req.publicationSite.url + '/datasets/{id}'

  for (const dataset of datasets) {
    const datasetUrl = datasetUrlTemplate.replace('{slug}', dataset.slug).replace('{id}', dataset.id)
    /** @type {any} */
    const datasetDCAT = {
      '@id': datasetUrl,
      '@type': 'Dataset',
      identifier: dataset.slug || dataset.id,
      landingPage: datasetUrl,
      title: dataset.title,
      description: dataset.description,
      issued: dataset.createdAt,
      modified: datasets.dataUpdatedAt || datasets.updatedAt
    }
    if (dataset.keywords?.length) datasetDCAT.keyword = dataset.keywords
    if (dataset.license?.href) datasetDCAT.license = dataset.license.href
    if (dataset.temporal && dataset.temporal.start) {
      if (dataset.temporal.end) {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.start}`
      } else {
        datasetDCAT.temporal = dataset.temporal.start
      }
    }
    if (dataset.frequency) datasetDCAT['dct:accrualPeriodicity'] = 'http://purl.org/cld/freq/' + dataset.frequency

    const distributions = []
    if (dataset.file) {
      const originalRessourceUrl = `${req.publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}/raw`
      distributions.push({
        '@id': originalRessourceUrl,
        '@type': 'Distribution',
        identifier: `${dataset.slug || dataset.id}/raw`,
        title: `Fichier ${dataset.originalFile.name.split('.').pop()}`,
        description: `Téléchargez le fichier complet au format ${dataset.originalFile.name.split('.').pop()}.`,
        downloadURL: originalRessourceUrl,
        mediaType: dataset.originalFile.mimetype,
        bytesSize: dataset.originalFile.size
      })
      if (dataset.file.mimetype !== dataset.originalFile.mimetype) {
        const ressourceUrl = `${req.publicBaseUrl}/api/v1/datasets/${dataset.slug || dataset.id}/convert`
        distributions.push({
          '@id': ressourceUrl,
          '@type': 'Distribution',
          identifier: `${dataset.slug || dataset.id}/convert`,
          title: `Fichier ${dataset.file.name.split('.').pop()}`,
          description: `Téléchargez le fichier complet au format ${dataset.file.name.split('.').pop()}.`,
          downloadURL: ressourceUrl,
          mediaType: dataset.file.mimetype,
          bytesSize: dataset.file.size
        })
      }
    }

    if (distributions.length) datasetDCAT.distribution = distributions
    dcatDatasets.push(datasetDCAT)
  }

  const result = {
    '@context': dcatContext,
    '@type': 'Catalog',
    conformsTo: 'https://project-open-data.cio.gov/v1.1/schema',
    describedBy: 'https://project-open-data.cio.gov/v1.1/schema/catalog.json',
    dataset: dcatDatasets
  }
  res.type('application/ld+json')
  res.json(result)
}))
