import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import config from '#config'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import slug from 'slugify'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import axios from '../../src/misc/utils/axios.ts'
import { mapUrlToArtefact, newBaseAppUrl, rewriteTextAsset, extractHtmlAssetRefs, parseWebpackChunkUrls } from '../../src/base-applications/base-apps-migration-utils.ts'

const TEXT_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt'])
// files fetched even when nothing references them (data-fair conventions)
const CONVENTIONAL_FILES = ['config-schema.json', 'icon.png', 'thumbnail.png', 'favicon.ico', 'favicon.png']

const registryAx = () => axiosBuilder({
  baseURL: config.privateRegistryUrl,
  headers: { 'x-secret-key': config.secretKeys.registry }
})

const fetchBinary = async (url: string): Promise<Buffer | null> => {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
    return Buffer.from(res.data)
  } catch {
    return null
  }
}

/** Scrape a legacy app deployment into { relPath -> Buffer }, absolute prefix already relativized. */
const scrapeApp = async (oldUrl: string, debug: (msg: string) => void): Promise<Record<string, Buffer>> => {
  const absPrefixes = [oldUrl]
  const files: Record<string, Buffer> = {}
  const indexBuf = await fetchBinary(oldUrl + 'index.html')
  if (!indexBuf) throw new Error(`cannot fetch ${oldUrl}index.html`)
  const indexHtml = indexBuf.toString('utf8')

  // seed: html refs (self-hosted only) + conventional files
  const queue = new Set<string>()
  for (const ref of extractHtmlAssetRefs(indexHtml)) {
    const abs = new URL(ref, oldUrl).href
    if (abs.startsWith(oldUrl) && abs !== oldUrl + 'index.html') queue.add(abs.slice(oldUrl.length).split('?')[0])
  }
  for (const f of CONVENTIONAL_FILES) queue.add(f)

  // fetch to fixpoint: every downloaded text file can reveal more self-hosted refs
  // (webpack lazy chunks, css fonts, sourcemap links...)
  const failed: string[] = []
  const fetched = new Set<string>()
  while (queue.size) {
    const relPath = queue.values().next().value as string
    queue.delete(relPath)
    if (fetched.has(relPath)) continue
    fetched.add(relPath)
    const buf = await fetchBinary(oldUrl + relPath)
    if (!buf) {
      if (!CONVENTIONAL_FILES.includes(relPath)) failed.push(relPath)
      continue
    }
    const ext = path.extname(relPath).toLowerCase()
    if (TEXT_EXTS.has(ext)) {
      const text = buf.toString('utf8')
      // absolute self-refs inside js/css (escaped or not)
      for (const m of text.matchAll(new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`[\w\-./]+`, 'g'))) {
        queue.add(m[0].slice(oldUrl.length).split('?')[0])
      }
      // webpack/nuxt runtime chunk maps
      if (ext === '.js') {
        for (const chunkUrl of parseWebpackChunkUrls(text, oldUrl)) queue.add(chunkUrl.slice(oldUrl.length))
      }
      files[relPath] = Buffer.from(rewriteTextAsset(text, absPrefixes, relPath), 'utf8')
    } else {
      files[relPath] = buf
    }
  }
  files['index.html'] = Buffer.from(rewriteTextAsset(indexHtml, absPrefixes, 'index.html'), 'utf8')
  if (failed.length) debug(`WARNING ${oldUrl}: ${failed.length} referenced files could not be fetched: ${failed.slice(0, 5).join(', ')}`)
  return files
}

/** Download the real npm tarball of a jsDelivr-hosted app and rebase dist/ to the package root. */
const fetchNpmApp = async (npmPackage: string, minor: string): Promise<{ files: Record<string, Buffer>, version: string } | null> => {
  try {
    const meta = (await axios.get(`https://registry.npmjs.org/${npmPackage.replace('/', '%2f')}`, { timeout: 30000 })).data
    const versions = Object.keys(meta.versions).filter(v => v.startsWith(minor + '.'))
      .sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2]))
    const version = versions.pop()
    if (!version) return null
    const tarballBuf = await fetchBinary(meta.versions[version].dist.tarball)
    if (!tarballBuf) return null
    const files: Record<string, Buffer> = {}
    const extract = tar.extract()
    const done = new Promise<void>((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        const chunks: Buffer[] = []
        stream.on('data', c => chunks.push(c))
        stream.on('end', () => {
          // keep only dist/, rebased to the package root
          const m = header.name.match(/^package\/dist\/(.+)$/)
          if (m && header.type === 'file') files[m[1]] = Buffer.concat(chunks)
          next()
        })
        stream.on('error', reject)
      })
      extract.on('finish', () => resolve())
      extract.on('error', reject)
    })
    extract.end(zlib.gunzipSync(tarballBuf))
    await done
    // index.html of npm-published apps bakes absolute version-pinned jsDelivr urls
    const absPrefixes = [
      `https://cdn.jsdelivr.net/npm/${npmPackage}@${version}/dist/`,
      `https://cdn.jsdelivr.net/npm/${npmPackage}@${minor}/dist/`
    ]
    for (const relPath of Object.keys(files)) {
      const ext = path.extname(relPath).toLowerCase()
      if (TEXT_EXTS.has(ext)) files[relPath] = Buffer.from(rewriteTextAsset(files[relPath].toString('utf8'), absPrefixes, relPath), 'utf8')
    }
    return files['index.html'] ? { files, version } : null
  } catch {
    return null
  }
}

const packFiles = (files: Record<string, Buffer>): Promise<Buffer> => {
  const pack = tar.pack()
  const gzip = zlib.createGzip()
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    gzip.on('data', c => chunks.push(c))
    gzip.on('end', () => resolve(Buffer.concat(chunks)))
    gzip.on('error', reject)
  })
  pack.pipe(gzip)
  for (const [relPath, buf] of Object.entries(files)) {
    pack.entry({ name: path.posix.join('package', relPath) }, buf)
  }
  pack.finalize()
  return done
}

/** Metadata fields the legacy doc can contribute to the registry artefact.
 * When `artefact` is omitted (fresh publish) every available field is set.
 * When `artefact` is passed (re-entrant path against an already-existing artefact,
 * e.g. federated/mirrored install or a previous run that failed after the tarball
 * upload) only fields the artefact doesn't already carry are included, so we never
 * clobber metadata that legitimately came from elsewhere. */
const buildMetaPatch = (baseApp: any, artefact?: Record<string, any>): Record<string, any> => {
  const missing = (key: string) => !artefact || artefact[key] === undefined || artefact[key] === null
  const meta: Record<string, any> = {}
  if (missing('public')) meta.public = baseApp.public === true
  if (missing('deprecated')) meta.deprecated = baseApp.deprecated === true
  if (missing('privateAccess') && baseApp.privateAccess?.length) meta.privateAccess = baseApp.privateAccess
  if (missing('title') && baseApp.title) meta.title = { fr: baseApp.title }
  if (missing('description') && baseApp.description) meta.description = { fr: baseApp.description }
  if (missing('group') && baseApp.category) meta.group = { fr: baseApp.category }
  if (missing('documentation') && baseApp.documentation) meta.documentation = baseApp.documentation
  return meta
}

/** Upload baseApp's thumbnail to the artefact, unless the artefact already has one
 * (mirrors the processings' publish-plugins-to-registry precedent: never clobber a
 * thumbnail that already exists upstream). */
const fillThumbnailGap = async (ax: ReturnType<typeof registryAx>, artefactId: string, baseApp: any, artefact: Record<string, any> | undefined, debug: (msg: string) => void) => {
  if (artefact?.thumbnail) return
  const thumbnail = await fetchBinary(baseApp.image || baseApp.url + 'thumbnail.png')
  if (!thumbnail) return
  const thumbForm = new FormData()
  thumbForm.append('file', new Blob([thumbnail]), 'thumbnail.png')
  await ax.post(`/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`, thumbForm, { validateStatus: s => s < 300 })
  debug(`filled thumbnail gap for ${artefactId}`)
}

const upgradeScript: UpgradeScript = {
  description: 'Publish legacy base applications to the registry and rewrite all references',
  async exec (db, debug) {
    if (!config.privateRegistryUrl || !config.secretKeys.registry) {
      throw new Error('privateRegistryUrl and secretKeys.registry are required for the base-apps migration')
    }
    const ax = registryAx()
    const failures: { url: string, error: string }[] = []
    const baseApps = await db.collection('base-applications').find({}).toArray()
    for (const baseApp of baseApps) {
      const mapped = mapUrlToArtefact(baseApp.url)
      if (!mapped) {
        // either already migrated (new-style url) or unknown host -> report and leave untouched
        if (!baseApp.artefactId) failures.push({ url: baseApp.url, error: 'no deterministic artefact mapping' })
        continue
      }
      const { artefactId, packageName, minor, npmPackage } = mapped
      try {
        // 1. ensure the artefact exists in the registry (idempotent: probe first;
        //    on federated installs the artefact arrived through mirroring)
        const existing = await ax.get(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, { validateStatus: s => s === 200 || s === 404 })
        if (existing.status === 404) {
          // ops escape hatch: a hand-built tarball placed in dataDir wins over scraping
          const overridePath = path.join(config.dataDir, 'base-apps-migration', encodeURIComponent(artefactId) + '.tgz')
          let tarball = await fsp.readFile(overridePath).catch(() => null)
          let version = `${minor}.0`
          if (!tarball) {
            let files: Record<string, Buffer> | null = null
            if (npmPackage) {
              const npmResult = await fetchNpmApp(npmPackage, minor)
              if (npmResult) { files = npmResult.files; version = npmResult.version }
            }
            if (!files) files = await scrapeApp(baseApp.url, debug)
            files['package.json'] = Buffer.from(JSON.stringify({
              name: packageName,
              version,
              description: baseApp.title || baseApp.applicationName || packageName,
              license: 'AGPL-3.0-only',
              registry: { category: 'application' }
            }, null, 2))
            tarball = await packFiles(files)
          }
          const form = new FormData()
          form.append('category', 'application')
          form.append('file', new Blob([tarball]), 'app.tgz')
          await ax.post(`/api/v1/artefacts/npm/${encodeURIComponent(artefactId)}`, form, { validateStatus: s => s === 201 })
          // metadata from the legacy doc (fresh publish: nothing upstream yet, so every field applies)
          const meta = buildMetaPatch(baseApp)
          await ax.patch(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, meta)
          await fillThumbnailGap(ax, artefactId, baseApp, undefined, debug)
          debug(`published ${artefactId}`)
        } else {
          debug(`artefact ${artefactId} already in registry`)
          // re-entrant path: the artefact may already exist because a previous run of this
          // script published the tarball but failed before/during the metadata PATCH or the
          // thumbnail upload, or because it's a federated/mirrored artefact. Either way, only
          // fill in fields the artefact doesn't already carry - never clobber existing metadata.
          const artefact = existing.data as Record<string, any>
          const meta = buildMetaPatch(baseApp, artefact)
          if (Object.keys(meta).length) {
            await ax.patch(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, meta)
            debug(`filled metadata gaps for ${artefactId}: ${Object.keys(meta).join(', ')}`)
          }
          await fillThumbnailGap(ax, artefactId, baseApp, artefact, debug)
        }

        // 2. rewrite references (idempotent: only matches the old url)
        const oldUrl = baseApp.url
        const newUrl = newBaseAppUrl(config.publicUrl, packageName, minor)
        // canonical id: must be computed exactly like initBaseAppFromArtefact (service.ts) does at
        // boot/sync time, since syncRegistryBaseApps() upserts base-applications docs on this id.
        // Leaving the legacy id in place would create a duplicate/colliding doc on the next sync
        // (id and url both carry unique indexes).
        const newId = slug(newUrl, { lower: true })
        const unset: Record<string, ''> = {}
        if (baseApp.image === oldUrl + 'thumbnail.png') unset.image = ''

        // Rewrite application references BEFORE touching the base-applications doc itself.
        // These updateMany calls only ever match on the OLD url, so they're idempotent on
        // re-run (a no-op once already rewritten) - unlike the base-applications re-key below,
        // which changes the very key (`mapUrlToArtefact(baseApp.url)`) a re-run uses to find
        // this doc again. Doing the re-key first would mean a crash between it and these two
        // calls leaves the matching `applications` docs permanently orphaned on the old url:
        // the next run's `mapUrlToArtefact(baseApp.url)` no longer matches the (already
        // rewritten) base-applications doc, so `baseApp.url` here would never come up again.
        // With the re-key last, a crash anywhere before it just gets replayed identically.
        await db.collection('applications').updateMany({ url: oldUrl }, { $set: { url: newUrl, 'baseApp.url': newUrl, 'baseApp.id': newId } })
        await db.collection('applications').updateMany({ urlDraft: oldUrl }, { $set: { urlDraft: newUrl, 'baseAppDraft.url': newUrl, 'baseAppDraft.id': newId } })
        debug(`rewrote references ${oldUrl} -> ${newUrl}`)

        // Guard idempotency: the boot sync may have already upserted a doc at newId (e.g. it ran
        // between two executions of this script, or on a federated instance). Re-keying the legacy
        // doc onto that same id would collide with the unique index, so the synced doc wins - drop
        // the legacy doc instead (references were already rewritten above regardless of this branch).
        const collision = await db.collection('base-applications').findOne({ id: newId })
        if (collision && collision._id.toString() !== baseApp._id.toString()) {
          await db.collection('base-applications').deleteOne({ _id: baseApp._id })
          debug(`dropped legacy base-applications doc ${baseApp._id} in favor of already-synced ${newId}`)
        } else {
          await db.collection('base-applications').updateOne({ _id: baseApp._id },
            Object.keys(unset).length
              ? { $set: { url: newUrl, artefactId, id: newId }, $unset: unset }
              : { $set: { url: newUrl, artefactId, id: newId } })
        }
      } catch (err: any) {
        failures.push({ url: baseApp.url, error: err.message })
        debug(`FAILED ${baseApp.url}: ${err.message}`)
        internalError('base-apps-migration', err)
      }
    }
    if (failures.length) {
      const summary = `base-apps migration finished with ${failures.length} failures requiring manual follow-up: ${JSON.stringify(failures)}`
      debug(summary)
      internalError('base-apps-migration', new Error(summary))
    }
  }
}

export default upgradeScript
