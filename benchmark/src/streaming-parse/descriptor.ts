export interface Column { sourceKey: string; outKey: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'object'; separator: string | null }
export interface Descriptor { columns: Column[]; selectIncludesId: boolean }

const tyOf = (t?: string): Column['type'] =>
  t === 'integer' ? 'integer' : t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : t === 'string' ? 'string' : 'object'

export function schemaToDescriptor (schema: { key: string, type?: string, separator?: string }[], selectIncludesId: boolean): Descriptor {
  const columns: Column[] = schema.map(f => ({ sourceKey: f.key, outKey: f.key, type: tyOf(f.type), separator: f.separator ?? null }))
  return { columns, selectIncludesId }
}
