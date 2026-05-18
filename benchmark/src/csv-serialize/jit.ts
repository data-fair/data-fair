/* eslint-disable no-new-func */
// JIT-compiled CSV serializer, inspired by the JIT flatten in
// api/src/datasets/utils/flatten.ts. We compile, per-schema, a function
// that produces a CSV string for a whole array of rows in one pass.
//
// Semantics mirror the csv-stringify config used by results2csv / csvStreams:
//   - bom: leading
//   - quoted_string: true → string values are always wrapped in double quotes,
//     internal " escaped as ""
//   - delimiter customisable
//   - cast.boolean → '1' / '0' / ''
//   - null / undefined → empty field
//   - header row: x-originalName || title || key
//   - replace null char \0 in string values (we inline this instead of
//     post-processing the whole buffer)

import type { SchemaProp } from './schema.ts'

export interface JitOptions {
  bom?: boolean
  header?: boolean
  useTitle?: boolean
  delimiter?: string
  newline?: string
}

const escapeColumnHeader = (s: string) =>
  '"' + s.replace(/"/g, '""') + '"'

// inline expression that turns `o[key]` into a CSV cell, given the schema type
const cellExpr = (prop: SchemaProp, delim: string): string => {
  const v = `o["${prop.key}"]`
  switch (prop.type) {
    case 'boolean':
      return `(${v}===true?"1":${v}===false?"0":"")`
    case 'integer':
    case 'number':
      // null/undefined → '', otherwise rely on number→string coercion
      return `(${v}==null?"":""+${v})`
    case 'string':
    default:
      // always quote (matches quoted_string: true). Escape " and strip \0.
      // The two replaces only fire when the chars are present so the cost on
      // clean strings is just a couple of indexOf scans inside V8.
      return `(${v}==null?"":'"'+(""+${v}).replace(/"/g,'""').replace(/\\0/g,"")+'"')`
  }
}

export const compileJitBulk = (
  schema: SchemaProp[],
  opts: JitOptions = {}
): (rows: Record<string, any>[]) => string => {
  const delim = opts.delimiter ?? ','
  const nl = opts.newline ?? '\n'
  const bom = opts.bom ?? true
  const header = opts.header ?? true
  const useTitle = opts.useTitle ?? false

  const headerCells = schema.map(p => {
    const h = (useTitle ? p.title : p['x-originalName']) || p['x-originalName'] || p.key
    return escapeColumnHeader(h)
  }).join(delim)

  // Build the per-row body. We concat with `+` (V8 ropes are fine for this)
  // into a single `line` per row, then push lines to an array we join at the
  // end. Pushing to an array is cheaper than `out += ...` for many rows.
  const rowExpr = schema.map(p => cellExpr(p, delim)).join(`+'${delim}'+`)

  let code = ''
  code += 'const out = [];\n'
  if (bom) code += 'out.push(\'\\uFEFF\');\n'
  if (header) code += `out.push(${JSON.stringify(headerCells + nl)});\n`
  code += 'for (let i = 0; i < rows.length; i++) {\n'
  code += '  const o = rows[i];\n'
  code += `  out.push(${rowExpr}+${JSON.stringify(nl)});\n`
  code += '}\n'
  code += 'return out.join(\'\');\n'

  return new Function('rows', code) as any
}

export const compileJitRow = (
  schema: SchemaProp[],
  opts: JitOptions = {}
): { header: string; row: (o: Record<string, any>) => string; bom: string } => {
  const delim = opts.delimiter ?? ','
  const nl = opts.newline ?? '\n'
  const bom = opts.bom ?? true
  const useTitle = opts.useTitle ?? false

  const headerCells = schema.map(p => {
    const h = (useTitle ? p.title : p['x-originalName']) || p['x-originalName'] || p.key
    return escapeColumnHeader(h)
  }).join(delim) + nl

  const rowExpr = schema.map(p => cellExpr(p, delim)).join(`+'${delim}'+`)
  const code = `return ${rowExpr}+${JSON.stringify(nl)};`
  const rowFn = new Function('o', code) as any

  return {
    bom: bom ? '﻿' : '',
    header: headerCells,
    row: rowFn
  }
}
