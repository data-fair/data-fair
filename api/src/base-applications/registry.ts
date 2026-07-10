import config from '#config'
import path from 'path'
import memoize from 'memoizee'
import { ensureArtefact } from '@data-fair/lib-node-registry'
import { tmpDir } from '../datasets/utils/files.ts'
import { parseArtefactId } from './operations.ts'

export { parseArtefactId, parseAssetsPath } from './operations.ts'

// canonical url stored on base-application docs; applications keep matching their
// base app through this url exactly as they did with external CDN urls
export const baseAppUrl = (artefactId: string) => {
  const { packageName, minor } = parseArtefactId(artefactId)
  return `${config.publicUrl}/app-assets/${packageName}/${minor}/`
}

const cacheDir = config.registryCacheDir ?? path.join(tmpDir, 'registry-cache')

const doEnsure = async (artefactId: string): Promise<{ dir: string, version: string }> => {
  const { path: dir, version } = await ensureArtefact({
    registryUrl: config.privateRegistryUrl,
    secretKey: config.secretKeys.registry,
    artefactId,
    cacheDir
  })
  return { dir, version }
}

// at most one conditional GET to the registry per artefact per 30s;
// a patch re-upload of the same minor artefact is picked up within that window
export const ensureBaseAppDir = memoize(doEnsure, {
  profileName: 'ensureBaseAppDir',
  promise: true,
  primitive: true,
  maxAge: 30000
})
