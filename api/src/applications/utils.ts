import config from '#config'
import mongo from '#mongo'
import memoize from 'memoizee'
import path from 'path'
import fs from 'fs-extra'
import * as visibilityUtils from '../misc/utils/visibility.js'
import * as permissions from '../misc/utils/permissions.ts'
import { prepareMarkdownContent } from '../misc/utils/markdown.js'
import * as findUtils from '../misc/utils/find.js'
import clone from '@data-fair/lib-utils/clone.js'
import * as datasetUtils from '../datasets/utils/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { getPseudoSessionState } from '../misc/utils/users.ts'
import resolvePath from 'resolve-path' // safe replacement for path.resolve
import { ownerDir } from '../datasets/utils/files.ts'
import { updateTotalStorage } from '../datasets/utils/storage.ts'
import nodeDir from 'node-dir'
import { prepareThumbnailUrl } from '../misc/utils/thumbnails.js'
import { reqSession } from '@data-fair/lib-express'
import type { Application, PublicationSite, Request } from '#types'

export const clean = (application: Application, publicUrl: string, publicationSite: PublicationSite, query: Record<string, string> = {}) => {
  const select = query.select ? query.select.split(',') : []
  if (query.raw !== 'true') {
    if (!select.includes('-public')) application.public = permissions.isPublic('applications', application)
    if (!select.includes('-visibility')) application.visibility = visibilityUtils.visibility(application)
    if (!query.select || select.includes('description')) {
      application.description = application.description || ''
      application.description = prepareMarkdownContent(application.description, query.html, query.truncate, 'application:' + application.id, application.updatedAt)
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

const memoizedGetFreshDataset = memoize(async (id) => {
  return await mongo.db.collection('datasets').findOne({ id })
}, {
  profileName: 'getAppFreshDataset',
  promise: true,
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60, // 1 minute
})

export const refreshConfigDatasetsRefs = async (req: Request, application: Application, draft: boolean, checkWithPersonalSession = false) => {
  const publicBaseUrl = req.publicBaseUrl

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

      const datasetFilters = application.baseApp?.datasetsFilters?.[i] ?? {}
      if (datasetFilters.select) refreshKeys = refreshKeys.concat(datasetFilters.select)

      const freshDataset = tolerateStale
        ? clone(await memoizedGetFreshDataset(dataset.id))
        : (await mongo.db.collection('datasets').findOne({ id: dataset.id }))

      if (freshDataset) {
        if (checkWithPersonalSession) {
          if (!permissions.list('datasets', freshDataset, reqSession(req)).includes('readDescription')) {
            throw httpError(403, `Vous n'avez pas la permission de consulter les informations du jeu de données ${freshDataset.title ?? freshDataset.slug ?? freshDataset.id} référencé dans l'application.`)
          }
        } else {
          if (!permissions.list('datasets', freshDataset, getPseudoSessionState(application.owner, 'application config', application.id, 'admin')).includes('readDescription')) {
            let ownerName = application.owner.name
            if (application.department) ownerName += `(${application.departmentName})`
            throw httpError(403, `Le compte propriétaire de l'application (${ownerName}) n'a pas la permission de consulter les informations du jeu de données ${freshDataset.title ?? freshDataset.slug ?? freshDataset.id} référencé dans la configuration.`)
          }
        }

        datasetUtils.clean(req, freshDataset)
        for (const key of refreshKeys) {
          if (key === 'userPermissions') dataset.userPermissions = permissions.list('datasets', freshDataset, reqSession(req))
          if (key in freshDataset) dataset[key] = freshDataset[key]
        }
      }
      if (datasetFilters.properties) {
        for (const key of Object.keys(datasetFilters.properties)) {
          if (datasetFilters.properties[key].default && !(key in dataset)) dataset[key] = datasetFilters.properties[key].default
          if (datasetFilters.properties[key].const) dataset[key] = datasetFilters.properties[key].const
        }
      }
    }
  }
}

export const dir = (application: Application) => {
  return resolvePath(
    ownerDir(application.owner),
    path.join('applications', application.id)
  )
}

export const attachmentsDir = (application: Application) => {
  return resolvePath(dir(application), 'attachments')
}

export const attachmentPath = (application: Application, name: string) => {
  return resolvePath(attachmentsDir(application), name)
}

export const lsAttachments = async (application: Application) => {
  const dirName = attachmentsDir(application)
  if (!await fs.pathExists(dirName)) return []
  const files = (await nodeDir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

const storage = async (application: Application) => {
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
export const updateStorage = async (application: Application, deleted = false, checkRemaining = false) => {
  const db = mongo.db
  if (!deleted) {
    await db.collection('applications').updateOne({ id: application.id }, {
      $set: {
        storage: await storage(application)
      }
    })
  }
  return updateTotalStorage(application.owner, checkRemaining)
}
