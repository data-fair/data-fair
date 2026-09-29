// Object-mode parser and serializer of the three formats read and written as streams of objects
// (dataset files, master-data bulk search bodies and responses). Vendored from the mime-type-stream
// package, a 23-line wrapper whose dependency pins (csv-parse 4, with a prototype-replacement
// advisory, and csv-stringify 5) are replaced by current versions. Compared side by side over the
// test fixtures: identical records and CSV output; only the error code of a row with a wrong column
// count changed (CSV_RECORD_INCONSISTENT_COLUMNS), its message did not.
import type { Transform } from 'node:stream'
import { parse as csvParse } from 'csv-parse'
import { stringify as csvStringify } from 'csv-stringify'
import JSONStream from 'JSONStream'
import ndjson from 'ndjson'

export type MimeTypeStreams = { parser: () => Transform, serializer: () => Transform }

const types = {
  'text/csv': {
    parser: () => csvParse({ columns: true }),
    serializer: () => csvStringify({ header: true })
  },
  'application/json': {
    parser: () => JSONStream.parse('*'),
    serializer: () => JSONStream.stringify()
  },
  'application/x-ndjson': {
    parser: () => ndjson.parse(),
    serializer: () => ndjson.serialize()
  }
} satisfies Record<string, MimeTypeStreams>

export type StreamedMimeType = keyof typeof types

/** The parser and serializer factories of the mime type, or undefined for any other type. */
export function mimeTypeStream (mimeType: StreamedMimeType): MimeTypeStreams
export function mimeTypeStream (mimeType?: string): MimeTypeStreams | undefined
export function mimeTypeStream (mimeType?: string): MimeTypeStreams | undefined {
  if (!mimeType || !Object.hasOwn(types, mimeType)) return undefined
  return types[mimeType as StreamedMimeType]
}
