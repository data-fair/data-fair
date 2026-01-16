import { type Readable } from 'node:stream'
import type { CentralDirectory } from 'unzipper'

export type FileStats = {
  path: string
  size: number
  lastModified: Date
}

export type FileBackend = {
  lsr(path: string): Promise<string[]>
  lsrWithStats(path: string): Promise<FileStats[]>
  rm(path: string): Promise<void>
  readStream(path: string, ifModifiedSince?: string, range?: string): Promise<{ body: NodeJS.ReadableStream, size?: number, lastModified?: Date }>
  moveFromFs(tmpPath: string, path: string): Promise<void>
  writeStream(readStream: Readable, path: string): Promise<void>
  copyFile(srcPath: string, dstPath: string): Promise<void>
  copyDir(srcPath: string, dstPath: string): Promise<void>
  pathExists(path: string): Promise<boolean>
  zipDirectory(path: string): Promise<CentralDirectory>
}
