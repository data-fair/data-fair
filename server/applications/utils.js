const config = /** @type {any} */(require('config'))
const memoize = require('memoizee')
const visibilityUtils = require('../misc/utils/visibility')
const permissions = require('../misc/utils/permissions')
const { prepareMarkdownContent } = require('../misc/utils/markdown')
const findUtils = require('../misc/utils/find')
const clone = require('../misc/utils/clone')
const datasetUtils = require('../datasets/utils/index.js')

exports.clean = (application, publicUrl, publicationSite, query = {}) => {
  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    if (!select.includes('-public')) application.public = permissions.isPublic('applications', application)
    if (!select.includes('-visibility')) application.visibility = visibilityUtils.visibility(application)
    if (!query.select || select.includes('description')) {
      application.description = application.description || ''
      application.description = prepareMarkdownContent(application.description, query.html === 'true', query.truncate, 'application:' + application.id, application.updatedAt)
    }
    if (!select.includes('-links')) findUtils.setResourceLinks(application, 'application', publicUrl, publicationSite && publicationSite.applicationUrlTemplate)
  }

  delete application.permissions
  delete application._id
  delete application.configuration
  delete application.configurationDraft
  if (select.includes('-userPermissions')) delete application.userPermissions
  if (select.includes('-owner')) delete application.owner
  delete application._uniqueRefs
  return application
}

const memoizedGetFreshDataset = memoize(async (id, db) => {
  return await db.collection('datasets').findOne({ id })
}, {
  profileName: 'getAppFreshDataset',
  promise: true,
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60, // 1 minute
  length: 1 // ignore db parameter
})

/**
 * @param {import('express').Request} req
 * @param {any} application
 * @param {boolean} draft
 */
exports.refreshConfigDatasetsRefs = async (req, application, draft) => {
  const db = req.app.get('db')
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  // @ts-ignore
  const user = req.user

  const configuration = (draft ? (application.configurationDraft || application.configuration) : application.configuration) || {}

  const tolerateStale = !draft

  // Update the config with fresh information of the datasets include finalizedAt
  // this info can then be used to add ?finalizedAt=... to any queries
  // and so benefit from better caching
  const datasets = configuration && configuration.datasets && configuration.datasets.filter(d => !!d)
  if (datasets && datasets.length) {
    for (let i = 0; i < datasets.length; i++) {
      const dataset = datasets[i]
      if (!dataset.id) {
        console.error(`missing dataset id "${JSON.stringify(dataset)}" in app config "${application.id}"`)
        if (dataset.href) dataset.href = dataset.href.replace(config.publicUrl, publicBaseUrl)
        continue
      }
      let refreshKeys = Object.keys(dataset)
      refreshKeys.push('finalizedAt')
      refreshKeys.push('slug')

      const datasetFilters = application.baseApp.datasetsFilters?.[i] ?? {}
      if (datasetFilters.select) refreshKeys = refreshKeys.concat(datasetFilters.select)

      const freshDataset = tolerateStale
        ? clone(await memoizedGetFreshDataset(dataset.id, db))
        : (await db.collection('datasets').findOne({ id: dataset.id }))

      if (!freshDataset) throw new Error('dataset not found ' + dataset.id)
      datasetUtils.clean(req, freshDataset)

      for (const key of refreshKeys) {
        if (key === 'userPermissions') dataset.userPermissions = permissions.list('datasets', freshDataset, user)
        if (key in freshDataset) dataset[key] = freshDataset[key]
      }
    }
  }
}
