import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { Transform } from 'node:stream'
import { filesStorage } from '../files-storage/index.ts'

export const md5OfStream = (stream: Readable): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('md5')
  stream.on('data', (d) => hash.update(d))
  stream.on('end', () => resolve(hash.digest('hex')))
  stream.on('error', reject)
})

export const md5OfStorageFile = async (path: string): Promise<string> => {
  const { body } = await filesStorage.readStream(path)
  return md5OfStream(body)
}

// pass-through md5: hash the payload bytes while they stream to the store, so the anchor's
// md5 always describes the bytes actually stored in the payload (single read of the file)
export const md5Tee = () => {
  const hash = createHash('md5')
  const stream = new Transform({ transform (chunk, _enc, cb) { hash.update(chunk); cb(null, chunk) } })
  return { stream, digest: () => hash.digest('hex') }
}
