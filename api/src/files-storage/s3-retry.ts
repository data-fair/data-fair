// Some S3-compatible providers (Ceph RGW, older MinIO, Garage, ...) do not
// guarantee read-after-write consistency across distinct connections/processes:
// an object written by the API process can transiently return NoSuchKey (404)
// when read moments later by a worker. The AWS SDK only retries 5xx/throttling,
// not 404s, so we absorb these transient misses at the application layer.

export const isMissingError = (err: any): boolean => {
  if (!err) return false
  return err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404
}

type RetryOptions = {
  attempts?: number
  baseDelay?: number
  maxDelay?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Run an S3 read operation, retrying with exponential backoff when it fails
 * with a "missing" error (NoSuchKey / 404). Defaults to 5 attempts with delays
 * of 2s, 4s, 8s, 16s (~30s total) before giving up to the caller — which, for
 * worker tasks, is itself retried once by the worker error handler.
 * Non-missing errors are thrown immediately without retrying.
 */
export const retryOnMissing = async <T> (fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const attempts = options.attempts ?? 5
  const baseDelay = options.baseDelay ?? 2000
  const maxDelay = options.maxDelay ?? 16000
  const sleep = options.sleep ?? defaultSleep

  let lastErr: any
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isMissingError(err)) throw err
      lastErr = err
      if (attempt < attempts - 1) {
        await sleep(Math.min(maxDelay, baseDelay * Math.pow(2, attempt)))
      }
    }
  }
  throw lastErr
}
