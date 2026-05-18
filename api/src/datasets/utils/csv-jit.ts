/* eslint-disable no-new-func */
// CSV serializer used in the hot path of /lines (results2csv / csvStreams).
//
// We compile, per dataset+query, a function that produces one CSV row at a
// time. Same shape as getFlatten in flatten.ts: memoized on a small set of
// primitive keys.
//
// Output is byte-identical to csv-stringify with the options used in
// outputs.js#csvStringifyOptions, namely:
//   bom: true, header: true, quoted_string: true, delimiter: ',' (or ';' …),
//   cast.boolean: v===true?'1':v===false?'0':''.
// Plus the post-pass that replaces null chars (\0) is inlined here.
//
// csv-stringify dispatches on the runtime JS type of each value (not the
// schema type), and quoted_string only auto-quotes values whose ORIGINAL
// type was string (numbers and post-cast object/boolean strings are only
// quoted if they contain a special char). We replicate that.

import memoize from 'memoizee'

// Per-cell formatter. Defined at module scope so the compiled function can
// reference it by name and V8 has a stable shape to inline.
const NEEDS_QUOTE_DEFAULT = /[",\r\n]/

const makeFmt = (delimiter: string) => {
  // when the delimiter isn't ',' we need it in the quote-trigger check
  const needsQuoteRe = delimiter === ','
    ? NEEDS_QUOTE_DEFAULT
    : new RegExp('["\r\n' + delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']')

  return (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const t = typeof v
    if (t === 'string') {
      // strings are always quoted under quoted_string: true. Escape " → "" and
      // strip the special null character that csv-stringify can't represent.
      const s = v as string
      return '"' + s.replace(/"/g, '""').replace(/\0/g, '') + '"'
    }
    if (t === 'number') return '' + (v as number)
    if (t === 'boolean') return v === true ? '1' : v === false ? '0' : ''
    if (t === 'bigint') return '' + (v as bigint)
    // object / array / Date: same default as csv-stringify (cast.object =
    // JSON.stringify). The post-cast string is then conditionally quoted —
    // quoted_string does NOT auto-quote it because the original type wasn't
    // string.
    if (v instanceof Date) return '' + v.getTime()
    let s: string
    try {
      s = JSON.stringify(v)
    } catch {
      s = String(v)
    }
    if (s === undefined) return ''
    if (needsQuoteRe.test(s)) {
      return '"' + s.replace(/"/g, '""').replace(/\0/g, '') + '"'
    }
    return s.replace(/\0/g, '')
  }
}

export interface CsvJitColumn {
  key: string
  header: string
  /** schema type hint — drives the fast path. Anything other than the listed
   *  values (e.g. 'object' for geometry, or undefined) skips specialization
   *  and goes straight through fmt(). */
  type?: 'string' | 'integer' | 'number' | 'boolean'
}

export interface CsvJitOptions {
  bom?: boolean
  header?: boolean
  delimiter?: string
  newline?: string
}

export interface CompiledCsv {
  /** BOM + header row, ready to emit before the first data row. May be empty. */
  prologue: string
  /** Per-row serializer (does not include trailing chunks of other rows). */
  row: (o: Record<string, any>) => string
}

const escapeJsString = (s: string) => JSON.stringify(s)

// Per-column expression, fully inlined based on schema type. data-fair
// enforces the schema upstream (in the indexing / extension pipeline) so by
// the time results reach this serializer, values are guaranteed to match
// their declared type — no runtime typeof check needed for primitives.
// Columns without a known type (e.g. geometry with type='object') fall
// through to fmt(), which handles the generic case.
const cellExpr = (col: CsvJitColumn): string => {
  const v = `o[${escapeJsString(col.key)}]`
  switch (col.type) {
    case 'string':
      // always-quoted string (matches quoted_string: true). Strip null
      // chars; escape internal double quotes.
      return `(${v}==null?'':'"'+${v}.replace(/"/g,'""').replace(/\\0/g,'')+'"')`
    case 'integer':
    case 'number':
      return `(${v}==null?'':''+${v})`
    case 'boolean':
      // matches the cast override: true→'1', false→'0', null/undefined→''
      return `(${v}==null?'':${v}?'1':'0')`
    default:
      // unknown / object / etc → defer to the generic runtime formatter
      return `fmt(${v})`
  }
}

const compileCsv = (
  columns: CsvJitColumn[],
  opts: CsvJitOptions = {}
): CompiledCsv => {
  const delimiter = opts.delimiter ?? ','
  const newline = opts.newline ?? '\n'
  const bom = opts.bom ?? true
  const withHeader = opts.header ?? true

  const fmt = makeFmt(delimiter)

  // header row: header cells are JS strings → always quoted under
  // quoted_string=true. We compute them at compile time.
  const headerRow = withHeader
    ? columns.map(c => '"' + c.header.replace(/"/g, '""').replace(/\0/g, '') + '"').join(delimiter) + newline
    : ''

  const prologue = (bom ? '﻿' : '') + headerRow

  // body: <cell0> + ',' + <cell1> + ... + '\n', each cell inlined per type
  const cells = columns.map(cellExpr).join(`+${escapeJsString(delimiter)}+`)
  const body = `return ${cells}+${escapeJsString(newline)};`

  const rowFn = new Function('fmt', 'return function row (o) { ' + body + ' }')(fmt)

  return { prologue, row: rowFn }
}

const memoCompile = memoize(
  (
    _cacheKey: string,
    columns: CsvJitColumn[],
    bom: boolean,
    header: boolean,
    delimiter: string,
    newline: string
  ) => compileCsv(columns, { bom, header, delimiter, newline }),
  {
    profileName: 'csv-jit',
    max: 10000,
    maxAge: 1000 * 60 * 60, // 1 hour
    primitive: true,
    length: 1 // cache by cacheKey string only
  }
)

export interface GetCsvSerializerArgs {
  dataset: { id: string; finalizedAt?: string; schema: any[] }
  /** subset of dataset.schema keys to emit, in order (e.g. parsed from query.select) */
  selectKeys: string[]
  /** when true, use schema field title (falls back to x-originalName, then key) */
  useTitle?: boolean
  /** delimiter (defaults to ',') */
  delimiter?: string
  /** emit BOM (defaults to true) */
  bom?: boolean
  /** emit header row (defaults to true) */
  header?: boolean
  /** record separator (defaults to '\n') */
  newline?: string
}

export const getCsvSerializer = (args: GetCsvSerializerArgs): CompiledCsv => {
  const {
    dataset, selectKeys, useTitle = false,
    delimiter = ',', bom = true, header = true, newline = '\n'
  } = args

  const propByKey = new Map<string, any>()
  for (const p of dataset.schema) propByKey.set(p.key, p)

  const columns: CsvJitColumn[] = selectKeys.map(key => {
    const prop = propByKey.get(key)
    let h: string | undefined
    let type: CsvJitColumn['type']
    if (prop) {
      h = useTitle ? prop.title : prop['x-originalName']
      h = h || prop['x-originalName'] || prop.key
      if (prop.type === 'string' || prop.type === 'integer' || prop.type === 'number' || prop.type === 'boolean') {
        type = prop.type
      }
    }
    return { key, header: h || key, type }
  })

  const cacheKey = [
    dataset.id,
    dataset.finalizedAt || '',
    selectKeys.join(','),
    useTitle ? 't' : 'f',
    delimiter,
    bom ? 'b' : '-',
    header ? 'h' : '-',
    newline === '\n' ? 'n' : (newline === '\r\n' ? 'r' : Buffer.from(newline).toString('hex'))
  ].join('|')

  return memoCompile(cacheKey, columns, bom, header, delimiter, newline)
}

// non-memoized factory, for tests and cases where compilation is cheap
// relative to the work being done.
export const compileCsvNoCache = compileCsv
