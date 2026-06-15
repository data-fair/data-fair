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
