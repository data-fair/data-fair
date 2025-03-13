import config from '#config'
import mongo from '#mongo'
import memoize from 'memoizee'
import path from 'path'
import fs from 'fs-extra'
import * as visibilityUtils from '../misc/utils/visibility.js'
import * as permissions from '../misc/utils/permissions.js'
import { prepareMarkdownContent } from '../misc/utils/markdown.js'
import * as findUtils from '../misc/utils/find.js'
import clone from '@data-fair/lib-utils/clone.js'
import * as datasetUtils from '../datasets/utils/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { getPseudoUser } from '../misc/utils/users.js'
import resolvePath from 'resolve-path' // safe replacement for path.resolve
import { ownerDir } from '../datasets/utils/files.ts'
import { updateTotalStorage } from '../datasets/utils/storage.js'
import nodeDir from 'node-dir'
import { prepareThumbnailUrl } from '../misc/utils/thumbnails.js'

export const clean = (application, publicUrl, publicationSite, query = {}) => {
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

  const thumbnail = query.thumbnail || '300x200'
  if (application.image && application.public && !select.includes('-thumbnail')) {
    application.thumbnail = prepareThumbnailUrl(publicUrl + '/api/v1/applications/' + encodeURIComponent(application.id) + '/thumbnail', thumbnail)
  }
  if (application.image && publicUrl !== config.publicUrl) {
    application.image = application.image.replace(config.publicUrl, publicUrl)
  }
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
export const refreshConfigDatasetsRefs = async (req, application, draft) => {
  const db = mongo.db
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

      if (freshDataset) {
        const pseudoUser = getPseudoUser(application.owner, 'application config', application.id, 'admin')
        if (!permissions.list('datasets', freshDataset, pseudoUser).includes('readDescription')) {
          throw httpError(403, `permission manquante sur le jeu de données référencé dans l'application ${freshDataset.id}`)
        }

        datasetUtils.clean(req, freshDataset)
        for (const key of refreshKeys) {
          if (key === 'userPermissions') dataset.userPermissions = permissions.list('datasets', freshDataset, user)
          if (key in freshDataset) dataset[key] = freshDataset[key]
        }
      }
    }
  }
}

export const dir = (application) => {
  return resolvePath(
    ownerDir(application.owner),
    path.join('applications', application.id)
  )
}

export const attachmentsDir = (application) => {
  return resolvePath(dir(application), 'attachments')
}

export const attachmentPath = (application, name) => {
  return resolvePath(attachmentsDir(application), name)
}

export const lsAttachments = async (application) => {
  const dirName = attachmentsDir(application)
  if (!await fs.pathExists(dirName)) return []
  const files = (await nodeDir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

export const storage = async (db, es, application) => {
  const storage = {
    attachments: { size: 0, count: 0 },
    size: 0
  }

  const attachments = await lsAttachments(application)
  for (const attachment of attachments) {
    storage.attachments.size += (await fs.promises.stat(attachmentPath(application, attachment))).size
    storage.attachments.count++
  }
  storage.size += storage.attachments.size

  return storage
}

// After a change that might impact consumed storage, we store the value
export const updateStorage = async (app, application, deleted = false, checkRemaining = false) => {
  const db = mongo.db
  const es = app.get('es')
  if (application.draftReason) {
    console.warn(new Error('updateStorage should not be called on a draft dataset'))
    return
  }
  if (!deleted) {
    await db.collection('applications').updateOne({ id: application.id }, {
      $set: {
        storage: await storage(db, es, application)
      }
    })
  }
  return updateTotalStorage(db, application.owner, checkRemaining)
}
