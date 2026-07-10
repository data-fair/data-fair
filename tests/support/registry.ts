import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'

const registryPort = process.env.REGISTRY_PORT ?? '25161'
const directRegistryUrl = `http://localhost:${registryPort}`
/** Matches the registry container's SECRET_INTERNAL_SERVICES in docker-compose.yaml */
const secretKey = 'secret-registry-internal'

const internalAx = axiosBuilder({ baseURL: directRegistryUrl, headers: { 'x-secret-key': secretKey } })

/** Registry artefact id of a mock base app (one mutable artefact per minor line). */
export const mockAppArtefactId = (name: string) => `@test/${name}@0.1`

/** Pack a fixture directory as an npm-shaped tarball (entries under a package/ prefix). */
const packFixtureDir = async (dir: string): Promise<Buffer> => {
  const pack = tar.pack()
  const chunks: Buffer[] = []
  const gzip = zlib.createGzip()
  const done = (async () => {
    for await (const chunk of pack.pipe(gzip)) chunks.push(chunk as Buffer)
  })()
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const entryRel = path.posix.join(rel, entry.name)
      if (entry.isDirectory()) walk(entryRel)
      else pack.entry({ name: path.posix.join('package', entryRel) }, fs.readFileSync(path.join(dir, entryRel)))
    }
  }
  walk('')
  pack.finalize()
  await done
  return Buffer.concat(chunks)
}

/** Publish the 3 mock base apps to the dev/test registry — idempotent (re-upload replaces the tarball). */
export const publishMockApps = async () => {
  for (const name of ['monapp1', 'monapp2', 'monapp3']) {
    const tarball = await packFixtureDir(path.join(import.meta.dirname, '..', 'fixtures', 'base-apps', name))
    const form = new FormData()
    form.append('category', 'application')
    form.append('file', new Blob([tarball]), `${name}.tgz`)
    await internalAx.post(`/api/v1/artefacts/npm/${encodeURIComponent(mockAppArtefactId(name))}`, form, {
      validateStatus: s => s === 201
    })
    await internalAx.patch(`/api/v1/artefacts/${encodeURIComponent(mockAppArtefactId(name))}`, {
      public: name !== 'monapp2',
      title: { fr: `App test ${name}` }
    })
  }
}
