import type { ApiConfig } from '../../config/type/index.ts'
import fs from 'fs-extra'

// durably flush a file that was just written; here (config-free module) rather than in
// datasets/utils/files.ts so the fs backend can be imported without loading #config
export const fsyncFile = async (p: string) => {
  const fd = await fs.open(p, 'r')
  await fs.fsync(fd)
  await fs.close(fd)
}

/**
 * Prepare the S3 config for logging. The debug logs of a production API are routinely
 * collected and shipped to log aggregators, so the credentials must never appear in them.
 * The access key id is kept as-is: it identifies which key is in use, and is useless
 * without its secret.
 */
export const redactS3Config = (s3: ApiConfig['s3']) => {
  if (!s3?.credentials) return s3
  const { secretAccessKey, ...credentials } = s3.credentials
  return {
    ...s3,
    credentials: {
      ...credentials,
      ...(secretAccessKey === undefined ? {} : { secretAccessKey: '[redacted]' })
    }
  }
}
