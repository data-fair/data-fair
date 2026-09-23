/**
 * The deployment index served at /api/v1/agents/index.json: the service-level OpenAPI documents
 * an agent of this deployment composes into one tool set (contract: @data-fair/openapi-mcp,
 * README "Composing a deployment"). data-fair is the aggregator, so it is the one service that
 * knows what exists — by the same rule ui-config.ts uses: an integration exists when its private
 * URL is configured, and the public URL is the site origin plus the conventional mount path.
 *
 * Pure: the route passes the request's public base URL and the config values.
 */
import type { Index } from '@data-fair/openapi-mcp'

export interface AgentsIndexConfig {
  publicUrl: string
  directoryUrl: string
  privateProcessingsUrl?: string | null
}

/** The site base: the request's public base URL without data-fair's own mount path. */
const siteBase = (publicBaseUrl: string, publicUrl: string): string => {
  const mountPath = new URL(publicUrl).pathname.replace(/\/$/, '')
  return mountPath && publicBaseUrl.endsWith(mountPath) ? publicBaseUrl.slice(0, -mountPath.length) : new URL(publicBaseUrl).origin
}

export function agentsIndex (publicBaseUrl: string, cfg: AgentsIndexConfig): Index {
  const base = siteBase(publicBaseUrl, cfg.publicUrl)
  const services: Index['services'] = [{ id: 'data-fair', openapi: `${publicBaseUrl}/api/v1/api-docs.json` }]
  if (cfg.privateProcessingsUrl) services.push({ id: 'processings', openapi: `${base}/processings/api/v1/admin/api-docs.json` })
  services.push({ id: 'simple-directory', openapi: `${cfg.directoryUrl}/api/api-docs.json` })
  return {
    version: 1,
    services,
    profiles: {
      explore: {
        title: { fr: 'Explorer', en: 'Explore' },
        description: { fr: 'Outils en lecture seule sur tous les services.', en: 'Read-only tools over every service.' }
      }
    }
  }
}
