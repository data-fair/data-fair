import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'

const messages: Record<string, Record<string, string>> = {
  fr: {
    geocodeAddress: 'Géocoder une adresse',
    getUserGeolocation: 'Obtenir la géolocalisation de l\'utilisateur'
  },
  en: {
    geocodeAddress: 'Geocode an address',
    getUserGeolocation: 'Get user geolocation'
  }
}

export function useAgentGeoTools (locale: Ref<string>) {
  const t = (key: string) => messages[locale.value]?.[key] ?? messages.en[key] ?? key

  useAgentTool({
    name: 'geocode_address',
    description: 'Convert a French address or place name into geographic coordinates using the IGN Geoplateforme geocoding service. Returns matching locations with coordinates, postal code, city, and relevance score.',
    annotations: { title: t('geocodeAddress'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string' as const, description: 'Address or place name to search for in France (e.g. "20 avenue de Segur, Paris", "Mairie de Bordeaux", "33000")' },
        limit: { type: 'number' as const, description: 'Maximum number of results to return (default 5, max 20)' }
      },
      required: ['q'] as const
    },
    execute: async (params) => {
      const q = params.q?.trim()
      if (!q || q.length < 3) {
        return {
          content: [{ type: 'text' as const, text: 'Address must be at least 3 characters.' }],
          isError: true
        }
      }

      const limit = Math.min(Math.max(params.limit || 5, 1), 20)
      const url = new URL('https://data.geopf.fr/geocodage/search')
      url.searchParams.set('q', q)
      url.searchParams.set('limit', String(limit))

      let data: any
      try {
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Geocoding API error: ${err.message}` }],
          isError: true
        }
      }

      const features = data.features ?? []
      if (features.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No results found for "${q}".` }]
        }
      }

      const lines = features.map((f: any) => {
        const p = f.properties
        const [lon, lat] = f.geometry.coordinates
        return `- **${p.label}** (score: ${p.score?.toFixed(2)}, type: ${p.type})\n  Coordinates: ${lat}, ${lon}\n  Postal code: ${p.postcode}, City: ${p.city} (${p.citycode})\n  Context: ${p.context}`
      })

      return {
        content: [{
          type: 'text' as const,
          text: `**${features.length}** result(s) for "${q}":\n\n${lines.join('\n\n')}`
        }]
      }
    }
  })

  useAgentTool({
    name: 'get_user_geolocation',
    description: 'Get the current geographic position of the user using the browser Geolocation API. Returns latitude, longitude, and accuracy. The user may be prompted to grant location permission.',
    annotations: { title: t('getUserGeolocation'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      if (!navigator.geolocation) {
        return {
          content: [{ type: 'text' as const, text: 'Geolocation is not supported by this browser.' }],
          isError: true
        }
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 60_000
          })
        })

        const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = position.coords
        const parts = [
          `**Latitude**: ${latitude}`,
          `**Longitude**: ${longitude}`,
          `**Accuracy**: ${Math.round(accuracy)} m`
        ]
        if (altitude != null) {
          parts.push(`**Altitude**: ${altitude} m`)
          if (altitudeAccuracy != null) parts.push(`**Altitude accuracy**: ${Math.round(altitudeAccuracy)} m`)
        }

        return {
          content: [{ type: 'text' as const, text: parts.join('\n') }]
        }
      } catch (err: any) {
        const messages: Record<number, string> = {
          1: 'Location permission denied by user.',
          2: 'Position unavailable (location service error).',
          3: 'Geolocation request timed out.'
        }
        const message = messages[err.code] || err.message || 'Unknown geolocation error.'
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true
        }
      }
    }
  })
}
