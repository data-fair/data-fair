import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
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
