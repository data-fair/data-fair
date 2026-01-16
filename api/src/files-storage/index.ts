import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'
import type { FileBackend } from './types.ts'

export const filesStorage: FileBackend = config.filesStorage === 's3' ? new S3Backend() : new FsBackend()
export default filesStorage
