import { type ReadStream } from 'node:fs'
import { join as joinPath, relative as relativePath } from 'path'
import fs from 'fs-extra'
import type { FileStats, FileBackend } from './types.ts'
import { httpError } from '@data-fair/lib-express'
import { fsyncFile } from '../datasets/utils/files.ts'
import parseRange from 'range-parser'
import { pipeline } from 'node:stream/promises'
import nodeDir from 'node-dir'
import unzipper from 'unzipper'

export class FsBackend implements FileBackend {
  async lsr (path: string): Promise<string[]> {
    if (!await fs.pathExists(path)) return []
    return (await nodeDir.promiseFiles(path))
      .map(f => relativePath(path, f))
  }

  async lsrWithStats (path: string): Promise<FileStats[]> {
    const paths = await this.lsr(path)
    const results = []
    for (const p of paths) {
      const stat = await fs.stat(joinPath(path, p))
      results.push({
        path: p,
        size: stat.size,
        lastModified: stat.mtime,
      })
    }
    return results
  }

  async fileStats (path: string) {
    const stats = await fs.stat(path)
    return { size: stats.size, lastModified: stats.mtime }
  }

  async removeFile (path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true })
  }

  async removeDir (path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true })
  }

  async readStream (path: string, ifModifiedSince?: string, range?: string) {
    let stats
    try {
      stats = await fs.stat(path)
    } catch (err: any) {
      if (err.code === 'ENOENT') throw httpError(404, 'file not found')
      throw err
    }
    if (ifModifiedSince && new Date(ifModifiedSince).getDate() === stats.mtime.getDate()) {
      throw httpError(304)
    }
    if (range) {
      const ranges = parseRange(1000000, range)
      if (Array.isArray(ranges) && ranges.length === 1 && ranges.type === 'bytes') {
        const range = ranges[0]
        return {
          body: fs.createReadStream(path, { start: range.start, end: range.end }),
          size: (range.end - range.start) + 1,
          lastModified: stats.mtime,
          range: `bytes ${range.start}-${range.end}/${stats.size}`
        }
      }
    }
    return {
      body: fs.createReadStream(path),
      size: stats.size,
      lastModified: stats.mtime
    }
  }

  async moveFromFs (tmpPath: string, path: string) {
    // in 2 operations for atomicity in case we are on 2 separate volumes
    await fs.move(tmpPath, path + '.tmp')
    await fs.move(path + '.tmp', path, { overwrite: true })
    await fsyncFile(path)
  }

  async writeStream (readStream: ReadStream, path: string) {
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(path)
    const writeStream = fs.createWriteStream(path)
    await pipeline(readStream, writeStream)
    await fsyncFile(path)
  }

  async copyFile (srcPath: string, dstPath: string) {
    // in 2 operations for atomicity in case we are on 2 separate volumes
    await fs.copy(srcPath, dstPath + '.tmp')
    await fs.move(dstPath + '.tmp', dstPath, { overwrite: true })
    await fsyncFile(dstPath)
  }

  async moveFile (srcPath: string, dstPath: string) {
    // in 2 operations for atomicity in case we are on 2 separate volumes
    await fs.move(srcPath, dstPath + '.tmp')
    await fs.move(dstPath + '.tmp', dstPath, { overwrite: true })
    await fsyncFile(dstPath)
  }

  async copyDir (srcPath: string, dstPath: string) {
    await fs.copy(srcPath, dstPath)
  }

  async moveDir (srcPath: string, dstPath: string) {
    await fs.move(srcPath, dstPath)
  }

  async pathExists (path: string) {
    return fs.pathExists(path)
  }

  async zipDirectory (path: string) {
    return unzipper.Open.file(path)
  }

  async fileSample (path: string) {
    return fsFileSample(path)
  }
}

export const fsFileSample = async (path: string): Promise<Buffer> => {
  const st = await fs.stat(path)
  const fd = await fs.open(path, 'r')
  const size = Math.min(st.size, 1024 * 1024)
  const buffer = Buffer.alloc(size)
  await fs.read(fd, buffer, 0, size, 0)
  fs.close(fd)
  return buffer
}
