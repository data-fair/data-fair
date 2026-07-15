import config from '#config'
import path from 'path'
import memoize from 'memoizee'
import { ensureArtefact } from '@data-fair/lib-node-registry'
import { internalError } from '@data-fair/lib-node/observer.js'
import { tmpDir } from '../datasets/utils/files.ts'
import { parseArtefactId } from './operations.ts'

export { parseArtefactId, parseAssetsPath } from './operations.ts'

// canonical url stored on base-application docs; applications keep matching their
// base app through this url exactly as they did with external CDN urls
export const baseAppUrl = (artefactId: string) => {
  const { packageName, minor } = parseArtefactId(artefactId)
  return `${config.publicUrl.replace(/\/$/, '')}/app-assets/${packageName}/${minor}/`
}

const cacheDir = config.registryCacheDir ?? path.join(tmpDir, 'registry-cache')

// privateRegistryUrl / secretKeys.registry are nullable in the config type but boot-asserted
// non-null in api/src/app.js before this module's functions ever run (base apps are served
// exclusively from the registry) - narrow the nullable config type here rather than threading
// an assertion through every call site.
const privateRegistryUrl = config.privateRegistryUrl as string
const registrySecretKey = config.secretKeys.registry as string

// last successful ensure per artefact, kept as a stale-but-available fallback: memoizee
// does not cache rejections, so without this a registry outage takes down all app serving
// as soon as the 30s memoize window of every artefact expires, even though a perfectly
// usable extract still sits on disk.
const lastKnownGood = new Map<string, { dir: string, version: string }>()

const doEnsure = async (artefactId: string): Promise<{ dir: string, version: string }> => {
  try {
    const { path: dir, version } = await ensureArtefact({
      registryUrl: privateRegistryUrl,
      secretKey: registrySecretKey,
      artefactId,
      cacheDir
    })
    const result = { dir, version }
    lastKnownGood.set(artefactId, result)
    return result
  } catch (err) {
    const stale = lastKnownGood.get(artefactId)
    if (stale) {
      internalError('base-app-registry-stale', err)
      return stale
    }
    throw err
  }
}

// at most one conditional GET to the registry per artefact per 30s;
// a patch re-upload of the same minor artefact is picked up within that window
export const ensureBaseAppDir = memoize(doEnsure, {
  profileName: 'ensureBaseAppDir',
  promise: true,
  primitive: true,
  maxAge: 30000
})

// Forced re-check of the registry for a given artefact, rate-limited to at most one per
// artefact per 5s window and shared across all requests. Without this, a version mismatch
// (rolling-deploy self-heal) hit by an anonymous/unauthenticated client in a loop would
// defeat the 30s memoize 1:1 (one forced re-check per incoming request), and deleting the
// main memo entry while an ensure is already in flight would let two concurrent doEnsure
// calls race on ensureArtefact's pid-keyed temp extraction dir. Routing the delete+re-ensure
// itself through memoize serializes concurrent callers onto the same promise, and re-ensuring
// through ensureBaseAppDir (rather than calling doEnsure directly) repopulates the main memo
// so subsequent requests within the 30s window reuse the fresh result instead of forcing
// another registry round-trip.
export const refreshBaseAppDir = memoize(async (artefactId: string) => {
  ensureBaseAppDir.delete(artefactId)
  return ensureBaseAppDir(artefactId)
}, {
  profileName: 'refreshBaseAppDir',
  promise: true,
  primitive: true,
  maxAge: 5000
})
