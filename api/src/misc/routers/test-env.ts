import express from 'express'
import fs from 'fs-extra'
import mongo from '#mongo'
import es from '#es'
import config from '#config'
import { pendingTasks } from '../../workers/tasks.ts'
import { reset as resetPing } from '../../workers/ping.ts'
import { memoizedGetPublicationSiteSettings } from '../utils/settings.ts'
import * as rateLimiting from '../utils/rate-limiting.ts'
import testEvents from '../utils/test-events.ts'
import filesStorage from '../../files-storage/index.ts'
import { dataDir, tmpDir } from '../../datasets/utils/files.ts'

const router = express.Router()

// Full cleanup: delete all mongo collections data, clear ES indices, empty data dirs, clear caches
router.delete('/', async (req, res, next) => {
  try {
    await resetPing()

    await Promise.all([
      mongo.datasets.deleteMany({}),
      mongo.applications.deleteMany({}),
      mongo.applicationsKeys.deleteMany({}),
      mongo.limits.deleteMany({}),
      mongo.settings.deleteMany({}),
      mongo.db.collection('locks').deleteMany({}),
      mongo.db.collection('extensions-cache').deleteMany({}),
      mongo.remoteServices.deleteMany({}),
      mongo.baseApplications.deleteMany({}),
      mongo.db.collection('journals').deleteMany({}),
      filesStorage.removeDir(dataDir),
      es.client.indices.delete({ index: config.indicesPrefix + '-*', ignore_unavailable: true }).catch(() => {})
    ])
    await fs.ensureDir(dataDir)
    await fs.ensureDir(tmpDir)
    memoizedGetPublicationSiteSettings.clear()
    rateLimiting.clear()
    testEvents.removeAllListeners()

    // re-initialize remote services and base apps from config after cleanup
    const { init: initRemoteServices } = await import('../../remote-services/utils.ts')
    await initRemoteServices()
    const { init: initBaseApps } = await import('../../base-applications/router.ts')
    await initBaseApps()

    res.status(200).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Return pending tasks
router.get('/pending-tasks', (req, res) => {
  res.json(pendingTasks)
})

// Return ES index mapping/settings for a dataset
router.get('/dataset-es-info/:id', async (req, res, next) => {
  try {
    const index = `dataset-${config.mongo.url.split('/').pop()}-${req.params.id}`
    const exists = await es.client.indices.exists({ index })
    if (!exists) return res.status(404).json({ error: 'index not found' })
    const mapping = await es.client.indices.getMapping({ index })
    const settings = await es.client.indices.getSettings({ index })
    res.json({ mapping, settings })
  } catch (err) {
    next(err)
  }
})

// Check if a file exists in storage
router.get('/file-exists', async (req, res, next) => {
  try {
    const filePath = req.query.path as string
    if (!filePath) return res.status(400).json({ error: 'missing path query parameter' })
    const exists = await fs.pathExists(filePath)
    res.json({ exists })
  } catch (err) {
    next(err)
  }
})

// Set up nock interceptor in server process
router.post('/nock', async (req, res, next) => {
  try {
    const nock = (await import('nock')).default
    const { origin, method, path: nockPath, query, reply, persist } = req.body
    let interceptor = nock(origin)
    if (persist) interceptor = interceptor.persist()
    let scope = interceptor[method || 'get'](nockPath)
    if (query) scope = scope.query(query)
    scope.reply(reply?.status || 200, reply?.body, reply?.headers)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Clean all nocks
router.delete('/nock', async (req, res, next) => {
  try {
    const nock = (await import('nock')).default
    nock.cleanAll()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Call worker thread's nock setup function
router.post('/worker-nock', async (req, res, next) => {
  try {
    const { workers } = await import('../../workers/tasks.ts')
    const { worker, functionName, params } = req.body
    await workers[worker as keyof typeof workers].run(params || {}, { name: functionName })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Re-initialize base applications from config (needed after nock setup)
router.post('/reload-base-apps', async (req, res, next) => {
  try {
    const { init } = await import('../../base-applications/router.ts')
    await init()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Re-initialize remote services from config
router.post('/reload-remote-services', async (req, res, next) => {
  try {
    const { init } = await import('../../remote-services/utils.ts')
    await init()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Clear rate limiting only (without full data cleanup)
router.delete('/rate-limiting', (req, res) => {
  rateLimiting.clear()
  res.json({ ok: true })
})

// Clear memoized publication site settings cache
router.delete('/publication-sites-cache', (req, res) => {
  memoizedGetPublicationSiteSettings.clear()
  res.json({ ok: true })
})

// SSE stream of testEvents emissions
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })

  const onEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const onNotification = (data: any) => onEvent('notification', data)
  testEvents.on('notification', onNotification)

  req.on('close', () => {
    testEvents.off('notification', onNotification)
  })
})

export default router
