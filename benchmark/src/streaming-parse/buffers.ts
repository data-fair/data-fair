import { generateRows, generateWideRows, benchSchema, wideSchema } from '../seed.ts'
import { schemaToDescriptor, type Descriptor } from './descriptor.ts'

export interface NamedBuffer { name: string, buf: Buffer, descriptor: Descriptor }

const wrap = (rows: Record<string, any>[]): Buffer => {
  const hits = rows.map((r, i) => ({ _id: r._id ?? `id-${i}`, _score: null, sort: [i], _source: r }))
  return Buffer.from(JSON.stringify({ hits: { total: { value: rows.length, relation: 'eq' }, hits } }))
}

// nested + multivalue: dotted source keys and an array field with a separator
const nestedSchema = [
  { key: 'a.b', type: 'string' }, { key: 'a.c', type: 'integer' },
  { key: 'tags', type: 'string', separator: ';' }, { key: 'label', type: 'string' }
]
function generateNestedRows (count: number): Record<string, any>[] {
  const rows: Record<string, any>[] = []
  for (let i = 0; i < count; i++) {
    rows.push({ _id: `n-${i}`, a: { b: `deep-${i}`, c: i }, tags: [`t${i % 5}`, `t${i % 7}`, `t${i % 3}`], label: `row ${i}` })
  }
  return rows
}

// number-heavy: reuse wideSchema's number columns only-ish by using benchSchema numeric-forward
const numberSchema = Array.from({ length: 20 }, (_, i) => ({ key: `n${i}`, type: i % 2 ? 'number' : 'integer' }))
function generateNumberRows (count: number): Record<string, any>[] {
  const rows: Record<string, any>[] = []
  let s = 1
  for (let i = 0; i < count; i++) {
    const r: Record<string, any> = { _id: `num-${i}` }
    for (let c = 0; c < numberSchema.length; c++) { s = (s * 1103515245 + 12345) & 0x7fffffff; r[`n${c}`] = c % 2 ? s / 1000 : (s % 100000) }
    rows.push(r)
  }
  return rows
}

export function makeBuffers (rowCount = 10000): NamedBuffer[] {
  return [
    { name: 'string-heavy', buf: wrap(generateRows(rowCount)), descriptor: schemaToDescriptor(benchSchema, true) },
    { name: 'number-heavy', buf: wrap(generateNumberRows(rowCount)), descriptor: schemaToDescriptor(numberSchema, true) },
    { name: 'wide', buf: wrap(generateWideRows(rowCount)), descriptor: schemaToDescriptor(wideSchema, true) },
    { name: 'nested-multivalue', buf: wrap(generateNestedRows(rowCount)), descriptor: schemaToDescriptor(nestedSchema, true) }
  ]
}
