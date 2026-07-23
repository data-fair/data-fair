import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'
import type { FileBackend } from './types.ts'

const buildBackend = (): FileBackend => {
  if (config.filesStorage === 's3') {
    if (!config.s3.bucket) throw new Error('files storage is configured as s3 but s3.bucket is missing')
    return new S3Backend({ ...config.s3, bucket: config.s3.bucket, dataDir: config.dataDir })
  }
  return new FsBackend(config.dataDir)
}
export const filesStorage: FileBackend = buildBackend()
export default filesStorage
