import { createReadStream } from 'node:fs'
import fs from 'fs-extra'
import type { FileStats, FileBackend } from './types.ts'
import { httpError } from '@data-fair/lib-express'
import { fsyncFile } from '../datasets/utils/files.ts'

export class FsBackend implements FileBackend {
  async ls (path: string): Promise<FileStats[]> {
    if (!await fs.pathExists(path)) return []
    const files = await fs.readdir(path, { withFileTypes: true })
    return Promise.all(
      files.map(async (file) => {
        const stat = await fs.stat(`${path}/${file.name}`)
        return {
          name: file.name,
          size: stat.size,
          isDirectory: file.isDirectory(),
          lastModified: stat.mtime,
        }
      })
    )
  }

  async rm (path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true })
  }

  async readStream (path: string, ifModifiedSince?: string) {
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
    return {
      body: createReadStream(path),
      size: stats.size,
      lastModified: stats.mtime
    }
  }

  async moveFromFs (tmpPath: string, path: string): Promise<void> {
    // in 2 operations for atomicity in case we are on 2 separate volumes
    await fs.move(tmpPath, path + '.tmp')
    await fs.move(path + '.tmp', path)
    await fsyncFile(path)
  }

  async copyFile (srcPath: string, dstPath: string) {
    // in 2 operations for atomicity in case we are on 2 separate volumes
    await fs.copy(srcPath, dstPath + '.tmp')
    await fs.move(dstPath + '.tmp', dstPath)
    await fsyncFile(dstPath)
  }

  async copyDir (srcPath: string, dstPath: string) {
    await fs.copy(srcPath, dstPath)
  }

  async pathExists (path: string) {
    return fs.pathExists(path)
  }
}
