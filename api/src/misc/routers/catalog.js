import express from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mime from 'mime'
import * as findUtils from '../utils/find.js'
import * as datasetUtils from '../../datasets/utils/index.js'
import * as permissions from '../../misc/utils/permissions.ts'
import catalogApiDocs from '../../../contract/site-catalog-api-docs.js'
import dcatContext from '../utils/dcat/context.js'
import mongo from '#mongo'
import { reqSession } from '@data-fair/lib-express'

const router = express.Router()
export default router

router.use((req, res, next) => {
  if (req.mainPublicationSite) req.publicationSite = req.mainPublicationSite
  if (!req.publicationSite) {
    return next(httpError(400, 'catalog API can only be used from a publication site, not the back-office'))
  }
  next()
})

router.get('/datasets', async (req, res) => {
  const datasets = mongo.db.collection('datasets')
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

  const query = findUtils.query(req, req.getLocale(), reqSession(req), 'datasets', { topics: 'topics.id' }, false, extraFilters)
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
})

router.get('/api-docs.json', async (req, res) => {
  const settings = await mongo.db.collection('settings')
    .findOne({ type: req.publicationSite.owner.type, id: req.publicationSite.owner.id }, { projection: { info: 1 } })
  res.json(catalogApiDocs(req.publicBaseUrl, req.publicationSite, (settings && settings.info) || {}))
})

router.get('/dcat', async (req, res) => {
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
      { $or: permissions.filter(reqSession(req), 'datasets') }
    ]
  }

  // TODO: pagination ?

  const datasets = await mongo.db.collection('datasets')
    .find(query)
    .limit(10000)
    .project({
      _id: 0,
      id: 1,
      slug: 1,
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
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.end}`
      } else {
        datasetDCAT.temporal = `${dataset.temporal.start}/${dataset.temporal.start}`
      }
    }
    if (dataset.frequency) datasetDCAT.accrualPeriodicity = 'http://purl.org/cld/freq/' + dataset.frequency

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
        format: mime.extension(dataset.originalFile.mimetype),
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
          format: mime.extension(dataset.file.mimetype),
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
})
