import path from 'path'
import { isMainThread } from 'node:worker_threads'

type TmpDirConfig = { dataDir: string, tmpDir?: string, workerTmpDir?: string }

// no #config here: a worker thread resolves its tmp dir without loading and validating the config again
// the main thread / worker distinction separates the tmp directories when testing, to simulate a
// multi-process environment
export const resolveTmpDir = ({ dataDir, tmpDir, workerTmpDir }: TmpDirConfig) => {
  const relTmpDir = isMainThread ? tmpDir : (workerTmpDir ?? tmpDir)
  return relTmpDir ? path.resolve(relTmpDir) : path.join(path.resolve(dataDir), 'tmp')
}
