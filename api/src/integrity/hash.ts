import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { Transform } from 'node:stream'
import { filesStorage } from '../files-storage/index.ts'

export const sha256OfStream = (stream: Readable): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  stream.on('data', (d) => hash.update(d))
  stream.on('end', () => resolve(hash.digest('hex')))
  stream.on('error', reject)
})

export const sha256OfStorageFile = async (path: string): Promise<string> => {
  const { body } = await filesStorage.readStream(path)
  return sha256OfStream(body)
}

// pass-through hash: digest the payload bytes while they stream to their destination, so the
// recorded hash always describes the bytes actually written (single read of the file)
const hashTee = (algorithm: 'sha256' | 'md5') => {
  const hash = createHash(algorithm)
  const stream = new Transform({ transform (chunk, _enc, cb) { hash.update(chunk); cb(null, chunk) } })
  return { stream, digest: () => hash.digest('hex') }
}

// the anchor's file hash: sha256, not md5 — the payload reference dedupe keys off this hash,
// so it is storage-load-bearing (an md5 collision would collapse two file versions onto one
// locked payload) and must resist an adversarial tenant
export const sha256Tee = () => hashTee('sha256')

// platform-level originalFile.md5 only (filled during a file restore's re-ingest); never used
// as an integrity hash
export const md5Tee = () => hashTee('md5')
