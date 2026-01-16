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
  fileStats (path: string): Promise<{ size: number, lastModified: Date }>
  removeFile(path: string): Promise<void>
  removeDir(path: string): Promise<void>
  readStream(path: string, ifModifiedSince?: string, range?: string): Promise<{ body: Readable, size: number, lastModified: Date, range?: string }>
  moveFromFs(tmpPath: string, path: string): Promise<void>
  writeStream(readStream: Readable, path: string): Promise<void>
  writeString(path: string, content: string): Promise<void>
  copyFile(srcPath: string, dstPath: string): Promise<void>
  moveFile(srcPath: string, dstPath: string): Promise<void>
  copyDir(srcPath: string, dstPath: string): Promise<void>
  moveDir(srcPath: string, dstPath: string): Promise<void>
  pathExists(path: string): Promise<boolean>
  zipDirectory(path: string): Promise<CentralDirectory>
  fileSample(path: string): Promise<Buffer>
  checkAccess(): Promise<void>
}
