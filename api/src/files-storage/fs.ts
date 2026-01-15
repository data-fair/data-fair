import { createReadStream } from 'node:fs'
import fs from 'fs-extra'
import type { FileStats, FileBackend } from './types.ts'
import { httpError } from '@data-fair/lib-express'

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

  async moveTmpFile (tmpPath: string, path: string): Promise<void> {
    await fs.rename(tmpPath, path)
  }
}
