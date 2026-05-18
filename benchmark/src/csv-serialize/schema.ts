// Realistic-ish schema mimicking what data-fair datasets look like.
// Mix of types, headers (x-originalName) different from keys.

export interface SchemaProp {
  key: string
  type: 'string' | 'number' | 'integer' | 'boolean'
  format?: 'date' | 'date-time'
  'x-originalName'?: string
  title?: string
}

export const schema: SchemaProp[] = [
  { key: 'id', type: 'string', 'x-originalName': 'Identifiant' },
  { key: 'label', type: 'string', 'x-originalName': 'Libellé' },
  { key: 'category', type: 'string', 'x-originalName': 'Catégorie' },
  { key: 'comment', type: 'string', 'x-originalName': 'Commentaire' },
  { key: 'qty', type: 'integer', 'x-originalName': 'Quantité' },
  { key: 'price', type: 'number', 'x-originalName': 'Prix' },
  { key: 'ratio', type: 'number', 'x-originalName': 'Ratio' },
  { key: 'active', type: 'boolean', 'x-originalName': 'Actif' },
  { key: 'archived', type: 'boolean', 'x-originalName': 'Archivé' },
  { key: 'created_at', type: 'string', format: 'date-time', 'x-originalName': 'Création' },
  { key: 'updated_at', type: 'string', format: 'date-time', 'x-originalName': 'Modification' },
  { key: 'birth_date', type: 'string', format: 'date', 'x-originalName': 'Naissance' },
  { key: 'lat', type: 'number', 'x-originalName': 'Latitude' },
  { key: 'lon', type: 'number', 'x-originalName': 'Longitude' },
  { key: 'tags', type: 'string', 'x-originalName': 'Étiquettes' },
  { key: 'description', type: 'string', 'x-originalName': 'Description' }
]

const EDGE_STRINGS = [
  'simple',
  'has, comma',
  'has "quote"',
  'has\nnewline',
  'has\r\ncrlf',
  'has \0 null char',
  'multi, line\nwith "all" stuff',
  '',
  'unicode éàü 中文 🚀',
  'normal value'
]

const CATEGORIES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']

// deterministic pseudo-random (LCG) so runs are comparable
const makeRng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export const makeRows = (n: number, seed = 42): Record<string, any>[] => {
  const rand = makeRng(seed)
  const rows: Record<string, any>[] = []
  for (let i = 0; i < n; i++) {
    const r = (): number => rand()
    rows.push({
      id: `id-${i}`,
      label: `Item ${i}`,
      category: CATEGORIES[(r() * CATEGORIES.length) | 0],
      // 10% of rows get an edge-case comment, others get a plain one or null
      comment: r() < 0.1 ? EDGE_STRINGS[(r() * EDGE_STRINGS.length) | 0] : (r() < 0.3 ? null : `comment number ${i}`),
      qty: r() < 0.05 ? null : ((r() * 1000) | 0),
      price: r() < 0.05 ? null : Math.round(r() * 100000) / 100,
      ratio: r() < 0.05 ? null : r() * 10,
      active: r() < 0.5,
      archived: r() < 0.05 ? null : r() < 0.2,
      created_at: '2026-05-18T10:23:45.123Z',
      updated_at: r() < 0.1 ? null : '2026-05-18T11:00:00.000Z',
      birth_date: r() < 0.5 ? '1990-01-15' : null,
      lat: 48.85 + (r() - 0.5) * 0.1,
      lon: 2.35 + (r() - 0.5) * 0.1,
      tags: r() < 0.2 ? null : 'tag1, tag2, tag3',
      description: r() < 0.05 ? EDGE_STRINGS[(r() * EDGE_STRINGS.length) | 0] : `Long-ish description of item ${i} with extra words to make it realistic`
    })
  }
  return rows
}
