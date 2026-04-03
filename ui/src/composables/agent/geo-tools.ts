import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import * as geocodeAddress from '@data-fair/agent-tools-data-fair/geocode-address.ts'

const getUserGeolocationTitle: Record<string, string> = {
  fr: 'Obtenir la géolocalisation de l\'utilisateur',
  en: 'Get user geolocation'
}

export function useAgentGeoTools (locale: Ref<string>) {
  useAgentTool({
    ...geocodeAddress.schema,
    annotations: { title: (geocodeAddress.annotations as any)[locale.value]?.title ?? geocodeAddress.annotations.en.title, readOnlyHint: true },
    execute: async (params) => {
      let url: string
      try {
        url = geocodeAddress.buildUrl(params)
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: err.message }],
          isError: true
        }
      }

      let data: any
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Geocoding API error: ${err.message}` }],
          isError: true
        }
      }

      return {
        content: [{ type: 'text' as const, text: geocodeAddress.formatResult(data, params.q) }]
      }
    }
  })

  useAgentTool({
    name: 'get_user_geolocation',
    description: 'Get the current geographic position of the user using the browser Geolocation API. Returns latitude, longitude, and accuracy. The user may be prompted to grant location permission.',
    annotations: { title: getUserGeolocationTitle[locale.value] ?? getUserGeolocationTitle.en, readOnlyHint: true },
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
