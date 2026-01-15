export type FileStats = {
  name: string;
  size: number;
  isDirectory: boolean;
  lastModified: Date;
}

export type FileBackend = {
  ls(path: string): Promise<FileStats[]>;
  rm(path: string): Promise<void>;
  readStream(path: string, ifModifiedSince?: string): Promise<{ body: NodeJS.ReadableStream, size?: number, lastModified?: Date }>;
  moveTmpFile(tmpPath: string, path: string): Promise<void>;
}
