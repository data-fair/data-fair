export type FileStats = {
  name: string
  size: number
  isDirectory: boolean
  lastModified: Date
}

export type FileBackend = {
  ls(path: string): Promise<FileStats[]>
  rm(path: string): Promise<void>
  readStream(path: string, ifModifiedSince?: string, range?: string): Promise<{ body: NodeJS.ReadableStream, size?: number, lastModified?: Date }>
  moveFromFs(tmpPath: string, path: string): Promise<void>
  copyFile(srcPath: string, dstPath: string): Promise<void>
  copyDir(srcPath: string, dstPath: string): Promise<void>
  pathExists(path: string): Promise<boolean>
}
