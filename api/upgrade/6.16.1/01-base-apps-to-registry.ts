import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import config from '#config'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
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
          // metadata from the legacy doc
          const meta: Record<string, any> = {
            public: baseApp.public === true,
            deprecated: baseApp.deprecated === true
          }
          if (baseApp.privateAccess?.length) meta.privateAccess = baseApp.privateAccess
          if (baseApp.title) meta.title = { fr: baseApp.title }
          if (baseApp.description) meta.description = { fr: baseApp.description }
          if (baseApp.category) meta.group = { fr: baseApp.category }
          if (baseApp.documentation) meta.documentation = baseApp.documentation
          await ax.patch(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, meta)
          const thumbnail = await fetchBinary(baseApp.image || baseApp.url + 'thumbnail.png')
          if (thumbnail) {
            const thumbForm = new FormData()
            thumbForm.append('file', new Blob([thumbnail]), 'thumbnail.png')
            await ax.post(`/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`, thumbForm, { validateStatus: s => s < 300 })
          }
          debug(`published ${artefactId}`)
        } else {
          debug(`artefact ${artefactId} already in registry`)
        }

        // 2. rewrite references (idempotent: only matches the old url)
        const oldUrl = baseApp.url
        const newUrl = newBaseAppUrl(config.publicUrl, packageName, minor)
        const unset: Record<string, ''> = {}
        if (baseApp.image === oldUrl + 'thumbnail.png') unset.image = ''
        await db.collection('base-applications').updateOne({ _id: baseApp._id },
          Object.keys(unset).length
            ? { $set: { url: newUrl, artefactId }, $unset: unset }
            : { $set: { url: newUrl, artefactId } })
        await db.collection('applications').updateMany({ url: oldUrl }, { $set: { url: newUrl, 'baseApp.url': newUrl } })
        await db.collection('applications').updateMany({ urlDraft: oldUrl }, { $set: { urlDraft: newUrl, 'baseAppDraft.url': newUrl } })
        debug(`rewrote references ${oldUrl} -> ${newUrl}`)
      } catch (err: any) {
        failures.push({ url: baseApp.url, error: err.message })
        debug(`FAILED ${baseApp.url}: ${err.message}`)
      }
    }
    if (failures.length) {
      debug(`base-apps migration finished with ${failures.length} failures requiring manual follow-up: ${JSON.stringify(failures)}`)
    }
  }
}

export default upgradeScript
