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
      q: { type: 'string' as const, description: 'Address or place name to search for in France. Examples: "20 avenue de Segur, Paris", "Mairie de Bordeaux", "33000"' },
      limit: { type: 'number' as const, description: 'Maximum number of results to return (default: 5)' }
    },
    required: ['q'] as const
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      count: { type: 'number' as const, description: 'Number of results found' },
      results: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            label: { type: 'string' as const, description: 'Full formatted address' },
            score: { type: 'number' as const, description: 'Relevance score (0-1)' },
            type: { type: 'string' as const, description: 'Result type (e.g., housenumber, street, municipality)' },
            name: { type: 'string' as const, description: 'Name of the location' },
            postcode: { type: 'string' as const, description: 'Postal code' },
            city: { type: 'string' as const, description: 'City name' },
            citycode: { type: 'string' as const, description: 'INSEE city code' },
            context: { type: 'string' as const, description: 'Geographic context (department, region)' },
            longitude: { type: 'number' as const, description: 'Longitude coordinate' },
            latitude: { type: 'number' as const, description: 'Latitude coordinate' }
          }
        },
        description: 'Array of geocoding results with coordinates'
      }
    },
    required: ['count', 'results'] as const
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

export function formatResult (data: any, params: Params): { text: string, structuredContent: Record<string, any> } {
  const features = data.features ?? []

  const results = features.map((f: any) => ({
    label: f.properties.label ?? '',
    score: f.properties.score ?? 0,
    type: f.properties.type ?? '',
    name: f.properties.name ?? '',
    postcode: f.properties.postcode ?? '',
    city: f.properties.city ?? '',
    citycode: f.properties.citycode ?? '',
    context: f.properties.context ?? '',
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1]
  }))

  let text: string
  if (features.length === 0) {
    text = `No results found for "${params.q}".`
  } else {
    const lines = results.map((r: any) =>
      `- **${r.label}** (score: ${r.score?.toFixed?.(2) ?? r.score}, type: ${r.type})\n  Coordinates: ${r.latitude}, ${r.longitude}\n  Postal code: ${r.postcode}, City: ${r.city} (${r.citycode})\n  Context: ${r.context}`
    )
    text = `**${features.length}** result(s) for "${params.q}":\n\n${lines.join('\n\n')}`
  }

  return {
    text,
    structuredContent: {
      count: results.length,
      results
    }
  }
}
