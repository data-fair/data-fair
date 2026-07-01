export interface Substrate {
  name: string
  available: boolean
  t1(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<number>
  t2json(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<Buffer>
  t2csv(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<Buffer>
}
