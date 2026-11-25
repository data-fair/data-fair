import express from 'express'
import fs from 'fs-extra'
import path from 'node:path'
import mongo from '#mongo'
import es from '#es'
import config from '#config'
import { pendingTasks } from '../../workers/tasks.ts'
import { reset as resetPing } from '../../workers/ping.ts'
import { memoizedGetPublicationSiteSettings } from '../utils/settings.ts'
import { memoizedGetDataset } from '../../datasets/service.ts'
import { clearApiKeysCache } from '../utils/api-key.ts'
import { clearApplicationKeysCaches } from '../utils/application-key.ts'
import * as rateLimiting from '../utils/rate-limiting.ts'
import { clearThumbnailFailures } from '../utils/capture.ts'
import testEvents from '../utils/test-events.ts'
import filesStorage from '../../files-storage/index.ts'
import { dataDir, tmpDir } from '../../datasets/utils/files.ts'
import { capturedNotifications } from '../utils/test-notif-buffer.ts'

const router = express.Router()

// Prefixed test sub-spaces: a test suite owns the accounts whose ids start with its own prefix (test_<suite>_)
// and the data they own, cleaned without touching the other suites nor the unprefixed accounts
const testPrefixRegexp = /^test_[a-z0-9]+(?:_[a-z0-9]+)*_$/

// data-fair's own test suite: its clean also resets the process-wide test state its specs rely on
const ownSuitePrefix = 'test_datafair_'

// Cleanup of a sub-space (DELETE /?prefix=test_<suite>_): delete the data owned by its accounts from
// mongo/ES/filesystem, including the shared collections' documents keyed by the sub-space (remote services
// and base applications identified under the prefix, locks and integrity state of its datasets), then
// clear the in-memory caches (a recomputation at most for the other sub-spaces). The tmp dir is left to
// cleanTmp, which ages its files out: other sub-spaces may have uploads or worker tasks in flight there.
// Only the clean of data-fair's own suite (prefix exactly test_datafair_) also resets the process-wide test
// state its specs rely on: the worker ping start date, the extensions and thumbnails caches (not keyed by
// owner) and the listeners of the test events stream. Any other prefix leaves them alone.
router.delete('/', async (req, res, next) => {
  try {
    const prefix = req.query.prefix
    if (typeof prefix !== 'string' || !testPrefixRegexp.test(prefix)) {
      return res.status(400).type('text/plain').send('invalid test prefix')
    }
    // the prefix only holds [a-z0-9_], safe in a regexp
    const prefixRegexp = new RegExp('^' + prefix)

    const ownSuite = prefix === ownSuitePrefix
    if (ownSuite) await resetPing()

    const testOwnerFilter = { 'owner.id': { $regex: prefixRegexp } }
    const testIdFilter = { id: { $regex: prefixRegexp } }

    // collect test-owned dataset IDs before deleting them (for ES index cleanup)
    const testDatasets = await mongo.datasets.find(testOwnerFilter, { projection: { id: 1 } }).toArray()
    const testApplications = await mongo.applications.find(testOwnerFilter, { projection: { id: 1 } }).toArray()

    // delete ES indices for test-owned datasets: exactly theirs (indexPrefix carries a hash of the id), not
    // those of another dataset whose id starts with the same characters. The aliases, draft ones
    // included, go with their indices.
    if (testDatasets.length > 0) {
      const { indexPrefix } = await import('../../datasets/es/manage-indices.ts')
      const indexPatterns = testDatasets.map(d => `${indexPrefix(d)}-*`)
      await es.client.indices.delete({ index: indexPatterns.join(','), ignore_unavailable: true }).catch(() => {})

      // REST datasets also own per-dataset mongo collections (lines and revisions); left
      // behind, every e2e run or simulation against the dev env leaks them into its db,
      // where each one and its indexes cost mongod an open file handle
      const testIds = new Set(testDatasets.map(d => d.id))
      const restCollections = await mongo.db.listCollections({ name: { $regex: /^dataset-(data|revisions)-/ } }, { nameOnly: true }).toArray()
      for (const { name } of restCollections) {
        if (testIds.has(name.replace(/^dataset-(data|revisions)-/, ''))) await mongo.db.collection(name).drop()
      }
    }

    await Promise.all([
      // owner-filtered collections
      mongo.datasets.deleteMany(testOwnerFilter),
      mongo.applications.deleteMany(testOwnerFilter),
      mongo.db.collection('journals').deleteMany(testOwnerFilter),
      mongo.settings.deleteMany(testIdFilter),
      mongo.limits.deleteMany(testIdFilter),
      mongo.applicationsKeys.deleteMany(testOwnerFilter),
      // locks of the sub-space's resources (`<type>:<id>`, `datasets:slug:<owner type>:<owner id>:<slug>`),
      // the global task locks are released by their task
      mongo.db.collection<{ _id: string }>('locks').deleteMany({
        $or: [
          { _id: { $in: [...testDatasets.map(d => `datasets:${d.id}`), ...testApplications.map(a => `applications:${a.id}`)] } },
          { _id: { $regex: new RegExp('^datasets:slug:[a-z]+:' + prefix) } }
        ]
      }),
      // integrity watermarks keyed by revision prefix (data-fair/<owner type>-<owner id>/<dataset id>/)
      mongo.db.collection<{ _id: string }>('integrity-purge').deleteMany({ _id: { $regex: new RegExp('^data-fair/[a-z]+-' + prefix) } }),
      // the storage-accounting measure of still-locked test revisions would otherwise keep
      // counting into the freshly-reset limits and starve the next tests' storage quota
      mongo.db.collection('integrity-storage').deleteMany(testOwnerFilter),
      // not keyed by owner: only emptied for data-fair's own suite
      ...(ownSuite ? [mongo.db.collection('extensions-cache').deleteMany({}), mongo.db.collection('thumbnails-cache').deleteMany({})] : []),
      // remote services declared under the prefix, or mirroring a master data dataset of the sub-space
      mongo.remoteServices.deleteMany({ $or: [testIdFilter, { 'virtualDatasets.parent.owner.id': { $regex: prefixRegexp } }] }),
      // base applications served under the prefix (http://host/<prefix>…)
      mongo.baseApplications.deleteMany({ url: { $regex: new RegExp('^[a-z]+://[^/]+/' + prefix) } })
    ])

    // the other remote services and base applications (from the config) lose the sub-space's accounts
    const privateAccessPull = { $pull: { privateAccess: { id: { $regex: prefixRegexp } } } } as any
    await mongo.remoteServices.updateMany({ 'privateAccess.id': { $regex: prefixRegexp } }, privateAccessPull)
    await mongo.baseApplications.updateMany({ 'privateAccess.id': { $regex: prefixRegexp } }, privateAccessPull)

    // selective directory deletion: only remove the owner dirs of the sub-space
    for (const ownerType of ['user', 'organization']) {
      const ownerTypeDir = path.join(dataDir, ownerType)
      if (await fs.pathExists(ownerTypeDir)) {
        const entries = await fs.readdir(ownerTypeDir)
        for (const entry of entries) {
          if (entry.startsWith(prefix)) {
            await filesStorage.removeDir(path.join(ownerTypeDir, entry))
          }
        }
      }
    }
    await fs.ensureDir(dataDir)
    await fs.ensureDir(tmpDir)

    // the line edition arm its owners held (a run that ended without releasing it)
    const { releaseLineEditionArmOf } = await import('../../../contract/x-agent-line-edition.ts')
    if (releaseLineEditionArmOf(prefix)) {
      const { refreshPlatformDoc } = await import('../../platform-api-docs/service.ts')
      await refreshPlatformDoc()
    }

    memoizedGetPublicationSiteSettings.clear()
    memoizedGetDataset.clear()
    if (config.compatODS) {
      const { memoizedGetCompatODS } = await import('../../api-compat/ods/index.ts')
      memoizedGetCompatODS.clear()
    }
    // corpus statistics are memoized for up to an hour and are not derived from any document,
    // so without this every catalog-search ranking assertion is scored against whatever corpus
    // the previous suite left behind
    const { datasetsStats, applicationsStats } = await import('../utils/text-search/collections.ts')
    datasetsStats.clear()
    applicationsStats.clear()
    clearApiKeysCache()
    clearApplicationKeysCaches()
    rateLimiting.clear()
    clearThumbnailFailures()
    if (ownSuite) testEvents.removeAllListeners()

    // re-initialize remote services and base apps from config after cleanup
    const { init: initRemoteServices } = await import('../../remote-services/service.ts')
    await initRemoteServices()
    const { init: initBaseApps } = await import('../../base-applications/router.ts')
    await initBaseApps()

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Return pending tasks
router.get('/pending-tasks', (req, res) => {
  res.json(pendingTasks)
})

// the test diagnostics compare it before and after a failed test to tell a restart (nodemon) from a regression
const startedAt = new Date().toISOString()
router.get('/started-at', (req, res) => {
  res.json({ startedAt })
})

// Patch a dataset document directly in MongoDB (test-only). The body is normally a flat object
// of fields to $set (backward-compatible shape), but a `$unset` key is also recognized so tests
// can simulate an out-of-band tamper that REMOVES a covered field (e.g. `file`/`originalFile`),
// not just overwrites one.
router.post('/patch-dataset/:datasetId', async (req, res, next) => {
  try {
    const { $unset, ...flatSet } = req.body ?? {}
    const update: any = {}
    if (Object.keys(flatSet).length) update.$set = flatSet
    if ($unset) update.$unset = $unset
    if (!update.$set && !update.$unset) update.$set = {}
    await mongo.datasets.updateOne({ id: req.params.datasetId }, update)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Return the raw MongoDB document for a dataset (including draft field)
router.get('/raw-dataset/:id', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.id })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    res.json(dataset)
  } catch (err) {
    next(err)
  }
})

// Patch an application document directly in MongoDB (test-only). Same shape as
// patch-dataset above (flat body -> $set, optional `$unset` key -> $unset).
router.post('/patch-application/:applicationId', async (req, res, next) => {
  try {
    const { $unset, ...flatSet } = req.body ?? {}
    const update: any = {}
    if (Object.keys(flatSet).length) update.$set = flatSet
    if ($unset) update.$unset = $unset
    if (!update.$set && !update.$unset) update.$set = {}
    await mongo.applications.updateOne({ id: req.params.applicationId }, update)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Return the raw MongoDB document for an application
router.get('/raw-application/:id', async (req, res, next) => {
  try {
    const application = await mongo.applications.findOne({ id: req.params.id })
    if (!application) return res.status(404).json({ error: 'application not found' })
    res.json(application)
  } catch (err) {
    next(err)
  }
})

// Return ES index mapping/settings for a dataset. Always the PUBLISHED alias (never the draft
// one), which is what lets a test assert that a draft-mode operation left it untouched.
router.get('/dataset-es-info/:id', async (req, res, next) => {
  try {
    // same alias `datasets/es/commons.ts` builds for a non-draft dataset
    const index = `${config.indicesPrefix}-${req.params.id}`
    const exists = await es.client.indices.exists({ index })
    if (!exists) return res.status(404).json({ error: 'index not found' })
    const mapping = await es.client.indices.getMapping({ index })
    const settings = await es.client.indices.getSettings({ index })
    res.json({ mapping, settings })
  } catch (err) {
    next(err)
  }
})

// Check if a file exists in storage (path is relative to dataDir)
router.get('/file-exists', async (req, res, next) => {
  try {
    const filePath = req.query.path as string
    if (!filePath) return res.status(400).json({ error: 'missing path query parameter' })
    const { resolve } = await import('node:path')
    const fullPath = resolve(dataDir, filePath)
    const exists = await fs.pathExists(fullPath)
    res.json({ exists })
  } catch (err) {
    next(err)
  }
})

// Call a function in a worker thread (e.g. setEnv for testing)
router.post('/worker-call', async (req, res, next) => {
  try {
    const { workers } = await import('../../workers/tasks.ts')
    const { worker, functionName, params } = req.body
    await workers[worker as keyof typeof workers].run(params || {}, { name: functionName })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Re-initialize base applications from config
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
    const { init } = await import('../../remote-services/service.ts')
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

// Clear memoized dataset cache
router.delete('/dataset-cache', (req, res) => {
  memoizedGetDataset.clear()
  res.json({ ok: true })
})

// Count documents in a REST dataset MongoDB collection
router.get('/rest-collection-count/:datasetId', async (req, res, next) => {
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter as string) : {}
    const count = await mongo.db.collection('dataset-data-' + req.params.datasetId).countDocuments(filter)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

// Find one document in a REST dataset MongoDB collection
router.get('/rest-collection-find-one/:datasetId', async (req, res, next) => {
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter as string) : {}
    const projection = req.query.projection ? JSON.parse(req.query.projection as string) : undefined
    const doc = await mongo.db.collection('dataset-data-' + req.params.datasetId).findOne(filter, { projection })
    res.json(doc)
  } catch (err) {
    next(err)
  }
})

// Update one document in a REST dataset MongoDB collection
router.post('/rest-collection-update-one/:datasetId', async (req, res, next) => {
  try {
    const { filter, update, upsert } = req.body
    await mongo.db.collection('dataset-data-' + req.params.datasetId).updateOne(filter, update, { upsert: !!upsert })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Delete one document in a REST dataset MongoDB collection (out-of-band tamper for integrity tests)
router.post('/rest-collection-delete-one/:datasetId', async (req, res, next) => {
  try {
    await mongo.db.collection('dataset-data-' + req.params.datasetId).deleteOne(req.body.filter)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Update one document in the settings collection (for injecting internal fields in tests)
router.post('/settings-update-one', async (req, res, next) => {
  try {
    const { filter, update } = req.body
    await mongo.settings.updateOne(filter, update)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Tamper a dataset's stored original file out-of-band (test-only, for integrity breach tests)
router.post('/tamper-dataset-file/:datasetId', async (req, res) => {
  const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
  if (!dataset) return res.status(404).send()
  const datasetUtils = await import('../../datasets/utils/index.ts')
  const { filesStorage } = await import('../../files-storage/index.ts')
  if (req.body?.delete) await filesStorage.removeFile(datasetUtils.originalFilePath(dataset))
  else await filesStorage.writeString(datasetUtils.originalFilePath(dataset), req.body?.content ?? 'tampered-out-of-band')
  res.status(204).send()
})

// Out-of-band ES tamper through the dataset's alias (integrity index-verdict tests). The alias
// resolves to exactly one index so writes through it are accepted by ES.
router.post('/es-tamper/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const esModule = await import('#es')
    const esDefault = esModule.default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    if (req.body?.delete) {
      await esDefault.client.deleteByQuery({ index: alias, body: { query: req.body.query }, refresh: true })
    } else if (req.body?.insert) {
      await esDefault.client.index({ index: alias, document: req.body.insert, refresh: true })
    } else {
      await esDefault.client.updateByQuery({
        index: alias,
        body: { query: req.body.query, script: { source: req.body.script, ...(req.body.params ? { params: req.body.params } : {}) } },
        refresh: true
      })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Force a refresh of the dataset's alias so tests read a settled index before checking
router.post('/es-refresh/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const esModule = await import('#es')
    const esDefault = esModule.default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    await esDefault.client.indices.refresh({ index: aliasName(dataset) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Divert a dataset's alias to a doctored copy of its index (in-scope attack: the check must
// verify through the alias, never the physical index). The copy uses dynamic mapping — enough
// for the compare, which reads _source. The orphan copy is cleaned by nothing: test-env only.
router.post('/es-divert-alias/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const esModule = await import('#es')
    const esDefault = esModule.default
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    const current = Object.keys(await esDefault.client.indices.getAlias({ name: alias }))[0]
    const doctored = `${current}-doctored-${Date.now()}`
    await esDefault.client.reindex({ body: { source: { index: current }, dest: { index: doctored } }, refresh: true, wait_for_completion: true })
    await esDefault.client.updateByQuery({
      index: doctored,
      body: { query: req.body.query, script: { source: req.body.script } },
      refresh: true
    })
    await esDefault.client.indices.updateAliases({ body: { actions: [{ remove: { alias, index: current } }, { add: { alias, index: doctored } }] } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Rebuild a dataset's index WITHOUT one of its mapped fields and point the alias at it: models
// an index created by an older release, before that field was added to buildIndexMappings
// (strict mapping -> a bulk item carrying the field is rejected). The orphan copy is cleaned by
// nothing: test-env only.
router.post('/es-strip-mapping-field/:datasetId', async (req, res, next) => {
  try {
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).send()
    const field: string = req.body.field
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const alias = aliasName(dataset)
    const current = Object.keys(await es.client.indices.getAlias({ name: alias }))[0]
    const definition = (await es.client.indices.get({ index: current }))[current]
    const settings = { ...definition.settings }
    settings.index = { ...settings.index }
    for (const key of ['uuid', 'provided_name', 'creation_date', 'version']) delete settings.index[key]
    const mappings = definition.mappings ?? {}
    delete mappings.properties?.[field]
    const stripped = `${current}-stripped-${Date.now()}`
    await es.client.indices.create({ index: stripped, body: { settings, mappings } })
    await es.client.reindex({
      body: { source: { index: current }, dest: { index: stripped }, script: { source: 'ctx._source.remove(params.field)', params: { field } } },
      refresh: true,
      wait_for_completion: true
    })
    await es.client.indices.updateAliases({ body: { actions: [{ remove: { alias, index: current } }, { add: { alias, index: stripped } }] } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// The integrity passes below (purge, stale alerts, scope audit, storage measure) are bucket-wide
// in production. Run on demand they act only on the owners of one test sub-space
// (?prefix=test_<suite>_, required): a suite must not alert, measure or purge another one's data.
const sweepPrefix = (req: express.Request, res: express.Response): string | undefined => {
  const prefix = req.query.prefix
  if (typeof prefix !== 'string' || !testPrefixRegexp.test(prefix)) {
    res.status(400).type('text/plain').send('invalid test prefix')
    return undefined
  }
  return prefix
}

// Trigger the expired-revision purge on demand (test-only). `ignoreAge` skips the age pre-filter
// and `skewMarginMs` shrinks the clock-skew margin, so a test can exercise the real retain-until
// decision on a seconds-long lock instead of waiting out a full retention window.
router.post('/integrity-purge/run', async (req, res, next) => {
  try {
    const ownerIdPrefix = sweepPrefix(req, res)
    if (!ownerIdPrefix) return
    const { ownerPrefixInScope } = await import('../../integrity/operations.ts')
    const keyPrefix: string | undefined = req.body?.prefix
    if (keyPrefix !== undefined && !ownerPrefixInScope(keyPrefix.split('/').slice(0, 2).join('/') + '/', ownerIdPrefix)) {
      return res.status(400).type('text/plain').send('the key prefix is outside the test prefix')
    }
    const { purgeExpiredRevisions } = await import('../../integrity/purge.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await purgeExpiredRevisions(integrityStore(), {
      prefix: keyPrefix,
      ownerIdPrefix,
      ignoreAge: !!req.body?.ignoreAge,
      skewMarginMs: req.body?.skewMarginMs,
      ignoreWatermark: !!req.body?.ignoreWatermark
    }))
  } catch (err) {
    next(err)
  }
})

// Trigger the check-stale alert sweep on demand (test-only)
router.post('/integrity-stale/run', async (req, res, next) => {
  try {
    const ownerIdPrefix = sweepPrefix(req, res)
    if (!ownerIdPrefix) return
    const { alertStaleChecks } = await import('../../integrity/checker.ts')
    res.json(await alertStaleChecks({ ownerIdPrefix }))
  } catch (err) {
    next(err)
  }
})

// Trigger the store-vs-Mongo integrity scope audit on demand (test-only)
router.post('/integrity-audit/run', async (req, res, next) => {
  try {
    const ownerIdPrefix = sweepPrefix(req, res)
    if (!ownerIdPrefix) return
    const { auditScopes } = await import('../../integrity/audit.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await auditScopes(integrityStore(), { reclaimedMarkers: req.body?.reclaimedMarkers, ownerIdPrefix }))
  } catch (err) {
    next(err)
  }
})

// Trigger the integrity storage-accounting measure on demand (test-only)
router.post('/integrity-storage/run', async (req, res, next) => {
  try {
    const ownerIdPrefix = sweepPrefix(req, res)
    if (!ownerIdPrefix) return
    const { measureIntegrityStorage } = await import('../../integrity/storage.ts')
    const { integrityStore } = await import('../../integrity/store-factory.ts')
    res.json(await measureIntegrityStorage(integrityStore(), { ownerIdPrefix }))
  } catch (err) {
    next(err)
  }
})

// Hold / release a lock from the locks collection (test-only): lets a test simulate a busy
// dataset (worker task in progress) and assert the integrity admin actions answer 409
router.post('/lock/:key', async (req, res, next) => {
  try {
    const locks = (await import('@data-fair/lib-node/locks.js')).default
    res.json({ ack: await locks.acquire(req.params.key, 'test-env') })
  } catch (err) {
    next(err)
  }
})
router.delete('/lock/:key', async (req, res, next) => {
  try {
    const locks = (await import('@data-fair/lib-node/locks.js')).default
    await locks.release(req.params.key)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Trigger the api-keys expiration cron task on demand (test-only)
router.post('/api-keys-expiration/run', async (req, res, next) => {
  try {
    const { task } = await import('../../settings/api-keys-expiration-worker.ts')
    await task()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Count ES indices matching a dataset prefix
router.get('/dataset-es-indices-count/:datasetId', async (req, res, next) => {
  try {
    const { indexPrefix } = await import('../../datasets/es/manage-indices.ts')
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    const indices = await es.client.indices.get({ index: `${indexPrefix(dataset)}-*` })
    res.json({ count: Object.keys(indices).length })
  } catch (err) {
    next(err)
  }
})

// Get ES alias name for a dataset
router.get('/dataset-es-alias-name/:datasetId', async (req, res, next) => {
  try {
    const { aliasName } = await import('../../datasets/es/commons.ts')
    const mergeDraft = (await import('../../datasets/utils/merge-draft.ts')).default
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    if (dataset.draft) mergeDraft(dataset)
    res.json({ aliasName: aliasName(dataset) })
  } catch (err) {
    next(err)
  }
})

// List attachment files for a dataset
router.get('/ls-attachments/:datasetId', async (req, res, next) => {
  try {
    const { lsAttachments } = await import('../../datasets/utils/files.ts')
    const dataset = await mongo.datasets.findOne({ id: req.params.datasetId })
    if (!dataset) return res.status(404).json({ error: 'dataset not found' })
    const files = await lsAttachments(dataset)
    res.json({ files })
  } catch (err) {
    next(err)
  }
})

// Emit a WebSocket event via wsEmitter
router.post('/ws-emit', async (req, res, next) => {
  try {
    const wsEmitter = await import('@data-fair/lib-node/ws-emitter.js')
    const { channel, data } = req.body
    await wsEmitter.emit(channel, data)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Validate DCAT JSON
router.post('/validate-dcat', async (req, res, next) => {
  try {
    const validateDcat = (await import('../utils/dcat/validate.ts')).default
    const valid = validateDcat(req.body)
    res.json({ valid, errors: valid ? undefined : validateDcat.errors })
  } catch (err) {
    next(err)
  }
})

// Set an environment variable in the main process (for testing)
router.post('/set-env', (req, res, next) => {
  try {
    const { key, value } = req.body
    if (value === undefined || value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Set a config value (for testing)
// Drop the memoized integrity store so a set-config change to `integrity.s3` is picked up on the
// next use (the client is built once per process). Test-only.
router.post('/reset-integrity-store', async (req, res, next) => {
  try {
    const { resetIntegrityStore } = await import('../../integrity/store-factory.ts')
    resetIntegrityStore()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/set-config', (req, res, next) => {
  try {
    const { path, value } = req.body
    const parts = path.split('.')
    let obj: any = config
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]]
    }
    obj[parts[parts.length - 1]] = value
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Dev-only line edition arm of the platform document (api/contract/x-agent-line-edition.ts), for an owner
// ({ owner: { type, id }, arm }, arm null to release it): one value for the whole document, held by the owners
// that set it. Another arm while other owners hold it answers 409 naming them. Answers once the platform
// document carries it.
router.post('/line-edition-arm', async (req, res, next) => {
  try {
    const arm = req.body?.arm
    if (arm !== 'json' && arm !== 'editor' && arm !== null) {
      return res.status(400).type('text/plain').send('arm must be "json", "editor" or null')
    }
    const owner = req.body?.owner
    if (typeof owner?.type !== 'string' || typeof owner?.id !== 'string' || !owner.type || !owner.id) {
      return res.status(400).type('text/plain').send('owner { type, id } is required')
    }
    const { holdLineEditionArm } = await import('../../../contract/x-agent-line-edition.ts')
    const holding = holdLineEditionArm(`${owner.type}:${owner.id}`, arm)
    if ('conflict' in holding) {
      return res.status(409).type('text/plain').send(`the line edition arm is held by ${holding.conflict}`)
    }
    if (holding.changed) {
      const { refreshPlatformDoc } = await import('../../platform-api-docs/service.ts')
      await refreshPlatformDoc()
    }
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Notification capture via shared buffer module
router.post('/events/start', (req, res) => {
  res.json({ offset: capturedNotifications.length })
})

router.get('/events/buffer', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0
  res.json(capturedNotifications.slice(offset))
})

// SSE stream of testEvents emissions
router.get('/events', (req, res) => {
  req.socket.setNoDelay(true)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.flushHeaders()

  const onEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const onNotification = (data: any) => onEvent('notification', data)
  const onExtensionInputs = (data: any) => onEvent('extension-inputs', data)
  const onWebhook = (data: any) => onEvent('webhook', data)
  testEvents.on('notification', onNotification)
  testEvents.on('extension-inputs', onExtensionInputs)
  testEvents.on('webhook', onWebhook)

  req.on('close', () => {
    testEvents.off('notification', onNotification)
    testEvents.off('extension-inputs', onExtensionInputs)
    testEvents.off('webhook', onWebhook)
  })
})

export default router
