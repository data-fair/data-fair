import express from 'express'
import path from 'path'
import { createReadStream } from 'node:fs'
import fsp from 'node:fs/promises'
import resolvePath from 'resolve-path' // safe replacement for path.resolve
import mongo from '#mongo'
import pump from '../misc/utils/pipe.ts'
import { parseAssetsPath, ensureBaseAppDir } from './registry.ts'

// Public, permission-free serving of base-app static files, shared by every
// application configured on the same base app. Two tiers:
// - /app-assets/<pkg>/<minor>/<exactVersion>/<file> : immutable (asset refs written
//   by the proxy into the transformed index.html)
// - /app-assets/<pkg>/<minor>/<file> : short TTL (icon.png / thumbnail.png, humans)
// index.html is NEVER served raw from here: it holds the %APPLICATION% placeholder
// and is only served transformed by the /app/:id proxy.
const router = express.Router()
export default router

// exported: the /app/:id proxy reuses this map for its extraPath fallback (Task 5)
export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.pbf': 'application/x-protobuf'
}

router.get('/*assetPath', async (req, res) => {
  const segments = (req.params.assetPath ?? []) as unknown as string[]
  const parsed = parseAssetsPath([...segments])
  if (!parsed || !parsed.filePath || parsed.filePath === 'index.html') {
    res.status(404).send('unknown asset path')
    return
  }
  const baseApp = await mongo.baseApplications.findOne({ artefactId: parsed.artefactId }, { projection: { artefactId: 1 } })
  if (!baseApp) {
    res.status(404).send('unknown base application')
    return
  }
  let { dir, version } = await ensureBaseAppDir(parsed.artefactId)
  if (parsed.version && parsed.version !== version) {
    // rolling-deploy self-heal: this pod may hold a stale extract while another
    // pod already serves a fresher patch; re-check the registry once
    ensureBaseAppDir.delete(parsed.artefactId)
    ;({ dir, version } = await ensureBaseAppDir(parsed.artefactId))
  }
  let filePath: string
  try {
    filePath = resolvePath(dir, parsed.filePath)
  } catch {
    res.status(404).send('unknown asset path')
    return
  }
  const stats = await fsp.stat(filePath).catch(() => null)
  if (!stats || !stats.isFile()) {
    res.status(404).send('unknown asset path')
    return
  }
  const ext = path.extname(parsed.filePath).toLowerCase()
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Accel-Buffering', 'yes')
  res.setHeader('Content-Length', stats.size)
  // immutable is only safe to claim when the served extract actually matches the
  // requested exact version: if the self-heal retry above still didn't converge
  // (registry propagation lag across pods), we still serve the file gracefully
  // but must not let shared caches pin the mismatched content for a year
  const servedAsRequestedVersion = !!parsed.version && parsed.version === version
  if (servedAsRequestedVersion) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  else res.setHeader('Cache-Control', 'public, max-age=300')
  await pump(createReadStream(filePath), res)
})
