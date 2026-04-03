export const annotations = {
  fr: { title: 'Géocoder une adresse' },
  en: { title: 'Geocode an address' }
} as const

export const schema = {
  name: 'geocode_address',
  description: 'Convert a French address or place name into geographic coordinates using the IGN Geoplateforme geocoding service. Returns matching locations with coordinates, postal code, city, and relevance score.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      q: { type: 'string' as const, description: 'Address or place name to search for in France (e.g. "20 avenue de Segur, Paris", "Mairie de Bordeaux", "33000")' },
      limit: { type: 'number' as const, description: 'Maximum number of results to return (default 5, max 20)' }
    },
    required: ['q'] as const
  }
} as const

export interface Params {
  q: string
  limit?: number
}

export function buildUrl (params: Params): string {
  const q = params.q?.trim()
  if (!q || q.length < 3) throw new Error('Address must be at least 3 characters.')
  const limit = Math.min(Math.max(params.limit || 5, 1), 20)
  const url = new URL('https://data.geopf.fr/geocodage/search')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  return url.toString()
}

export function formatResult (data: any, q: string): string {
  const features = data.features ?? []
  if (features.length === 0) {
    return `No results found for "${q}".`
  }

  const lines = features.map((f: any) => {
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    return `- **${p.label}** (score: ${p.score?.toFixed(2)}, type: ${p.type})\n  Coordinates: ${lat}, ${lon}\n  Postal code: ${p.postcode}, City: ${p.city} (${p.citycode})\n  Context: ${p.context}`
  })

  return `**${features.length}** result(s) for "${q}":\n\n${lines.join('\n\n')}`
}
