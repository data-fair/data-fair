import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'

export const filesStorage = config.filesStorage === 's3' ? new S3Backend() : new FsBackend()
export default filesStorage
