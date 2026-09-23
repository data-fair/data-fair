// Ambient type declarations for genuinely untyped third-party modules consumed in api/src.
// These are minimal hand-written shims declaring only the surface we use — preferred over
// adding @types/* devDependencies (the project keeps package-lock churn minimal, see memory).
// `declare module` is global regardless of file location; this single file is the audit point
// for all third-party module shims. Add new shims here rather than scattering *-types.d.ts files.

declare module 'child-process-promise' {
  export const spawn: (command: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const exec: (command: string, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const execFile: (file: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
  export const fork: (modulePath: string, args?: any, options?: any) => Promise<{ stdout: any, stderr: any }>
}

declare module '@koumoul/icalendar' {
  interface ICalProperty {
    value: any
  }
  interface ICalComponent {
    properties: Record<string, ICalProperty[]>
    components: Record<string, ICalComponent[]>
    events: () => ICalComponent[]
  }
  const icalendar: {
    parse_calendar: (content: string) => ICalComponent
  }
  export default icalendar
}

declare module 'ngeohash' {
  const ngeohash: {
    decode_bbox: (hash: string) => number[]
    decode: (hash: string) => { longitude: number, latitude: number }
  }
  export default ngeohash
}

declare module 'number-abbreviate' {
  class NumberAbbreviate {
    constructor (units?: string[])
    abbreviate: (number: number, decimalPlaces?: number) => string
  }
  export default NumberAbbreviate
}

declare module 'object-hash' {
  const objectHash: (value: any, options?: any) => string
  export default objectHash
}

declare module 'lucene-query-parser' {
  const queryParser: {
    parse: (query: string) => any
  }
  export default queryParser
}

declare module '@terraformer/wkt' {
  export const geojsonToWKT: (geojson: any) => string
  export const wktToGeoJSON: (wkt: string) => any
}

declare module 'vt-pbf' {
  const vtpbf: {
    fromGeojsonVt: (layers: any, options?: any) => Uint8Array
    fromVectorTileJs: (tile: any) => Uint8Array
  }
  export default vtpbf
}

declare module 'JSONStream' {
  import type { Transform } from 'node:stream'
  const JSONStream: {
    parse: (path: string | any[], map?: (data: any) => any) => Transform
    stringify: (open?: string | false, sep?: string, close?: string, indent?: number) => Transform
  }
  export default JSONStream
}

declare module 'mime-type-stream' {
  import type { Transform } from 'node:stream'
  /** The three mime types the module actually handles; anything else yields undefined. */
  type MimeTypeStreamType = 'text/csv' | 'application/json' | 'application/x-ndjson'
  interface MimeTypeStreams { parser: () => Transform, serializer: () => Transform }
  const mimeTypeStream: {
    (mimeType: MimeTypeStreamType): MimeTypeStreams
    (mimeType?: string): MimeTypeStreams | undefined
  }
  export default mimeTypeStream
}

declare module 'mongo-escape' {
  const mongoEscape: {
    /** `$` and `.` in keys become their fullwidth forms; `recurse` also escapes nested objects. */
    escape: <T>(input: T, recurse?: boolean) => T
    unescape: <T>(input: T, recurse?: boolean) => T
  }
  export default mongoEscape
}
