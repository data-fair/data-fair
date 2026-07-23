import type { FileBackend } from '../../files-storage/types.ts'
import { arrayBuffer } from 'stream/consumers'

export type AttachmentStorage = Pick<FileBackend, 'fileExists' | 'fileStats' | 'readStream'>

// On S3 the existence check and the subsequent stats/read are separate requests on a
// shared-nothing store, so the file can be reported present and still 404 on read
// (eventual consistency, concurrent deletion). Not caught here, such a 404 fails the
// whole indexing task and the raw AWS-SDK error — whose message is the literal
// "UnknownError" for body-less HEAD responses — ends up verbatim in the dataset journal.
const is404 = (err: any) =>
  err?.status === 404 ||
  err?.statusCode === 404 ||
  err?.$metadata?.httpStatusCode === 404 ||
  err?.name === 'NotFound' ||
  err?.name === 'NoSuchKey' ||
  err?.code === 'ENOENT'

/**
 * Load the content of a line's attached file for full-text indexing.
 * A missing attachment degrades to a per-line warning (or a silent skip when it never
 * existed), it must never fail the indexing task. attachmentIndexedLimit uses the
 * config.defaultLimits convention: -1 means unlimited.
 */
export const readAttachmentContent = async (
  storage: AttachmentStorage,
  filePath: string,
  attachmentIndexedLimit: number
): Promise<{ raw?: string, warning?: string }> => {
  try {
    if (!await storage.fileExists(filePath)) return {}
    const stats = await storage.fileStats(filePath)
    if (attachmentIndexedLimit !== -1 && stats.size > attachmentIndexedLimit) {
      return { warning: 'Pièce jointe trop volumineuse pour être analysée' }
    }
    const buf = await arrayBuffer((await storage.readStream(filePath)).body)
    return { raw: Buffer.from(buf).toString('base64') }
  } catch (err: any) {
    if (is404(err)) return { warning: 'Pièce jointe introuvable' }
    throw err
  }
}
