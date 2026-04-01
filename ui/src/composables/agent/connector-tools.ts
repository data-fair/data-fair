import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $uiConfig, $sitePath } from '~/context'
import { createAgentTranslator, agentToolError, buildPaginatedQuery } from './utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    listProcessings: 'Lister les traitements',
    describeProcessing: 'Décrire un traitement',
    listCatalogs: 'Lister les catalogues',
    describeCatalog: 'Décrire un catalogue'
  },
  en: {
    listProcessings: 'List processings',
    describeProcessing: 'Describe a processing',
    listCatalogs: 'List catalogs',
    describeCatalog: 'Describe a catalog'
  }
}

async function serviceFetch<T> (url: string, query: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(query)
  const fullUrl = `${url}?${params.toString()}`
  const res = await fetch(fullUrl, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

export function useAgentConnectorTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  if ($uiConfig.processingsIntegration) {
    const processingsBase = `${$sitePath}/processings/api/v1/processings`

    useAgentTool({
      name: 'list_processings',
      description: 'List processings accessible to the current user with optional text search. Returns id, title, status, and scheduling info.',
      annotations: { title: t('listProcessings'), readOnlyHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const, description: 'Optional text search keywords' },
          page: { type: 'number' as const, description: 'Page number (default 1)' },
          size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
        }
      },
      execute: async (params) => {
        try {
          const { query, page, size } = buildPaginatedQuery(params)

          const data = await serviceFetch<{ count: number, results: { _id: string, title?: string, status?: string, scheduling?: { type: string }, updatedAt?: string }[] }>(processingsBase, query)

          const lines = data.results.map((p) => {
            const parts = [`- **${p.title || p._id}** (id: \`${p._id}\`)`,
              `  Status: ${p.status || 'unknown'}`]
            if (p.scheduling?.type) parts.push(`  Scheduling: ${p.scheduling.type}`)
            if (p.updatedAt) parts.push(`  Updated: ${p.updatedAt}`)
            return parts.join('\n')
          })

          return [
            `**${data.count}** processings found (page ${page}, ${size} per page)`,
            '',
            ...lines
          ].join('\n')
        } catch (err) {
          return agentToolError('Processings service unavailable', err)
        }
      }
    })

    useAgentTool({
      name: 'describe_processing',
      description: 'Get detailed metadata for a processing. Returns title, status, plugin info, scheduling, and configuration.',
      annotations: { title: t('describeProcessing'), readOnlyHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          processingId: { type: 'string' as const, description: 'The exact processing ID' }
        },
        required: ['processingId'] as const
      },
      execute: async (params) => {
        try {
          const res = await fetch(`${processingsBase}/${encodeURIComponent(params.processingId)}`, { credentials: 'include' })
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
          const p = await res.json()

          const meta: string[] = [
            `# ${p.title}`,
            `- **ID:** \`${p._id}\``,
            `- **Status:** ${p.status || 'unknown'}`,
            `- **Owner:** ${p.owner?.name || '?'}`
          ]
          if (p.plugin) meta.push(`- **Plugin:** ${p.plugin}`)
          if (p.scheduling) meta.push(`- **Scheduling:** ${JSON.stringify(p.scheduling)}`)
          if (p.updatedAt) meta.push(`- **Updated:** ${p.updatedAt}`)
          if (p.createdAt) meta.push(`- **Created:** ${p.createdAt}`)

          return meta.join('\n')
        } catch (err) {
          return agentToolError('Processings service unavailable', err)
        }
      }
    })
  }

  if ($uiConfig.catalogsIntegration) {
    const catalogsBase = `${$sitePath}/catalogs/api/catalogs`

    useAgentTool({
      name: 'list_catalogs',
      description: 'List catalogs accessible to the current user with optional text search. Returns id, title, type, and URL.',
      annotations: { title: t('listCatalogs'), readOnlyHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const, description: 'Optional text search keywords' },
          page: { type: 'number' as const, description: 'Page number (default 1)' },
          size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
        }
      },
      execute: async (params) => {
        try {
          const { query, page, size } = buildPaginatedQuery(params)

          const data = await serviceFetch<{ count: number, results: { _id: string, title?: string, type?: string, url?: string, updatedAt?: string }[] }>(catalogsBase, query)

          const lines = data.results.map((c) => {
            const parts = [`- **${c.title || c._id}** (id: \`${c._id}\`)`,
              `  Type: ${c.type || '?'}`]
            if (c.url) parts.push(`  URL: ${c.url}`)
            if (c.updatedAt) parts.push(`  Updated: ${c.updatedAt}`)
            return parts.join('\n')
          })

          return [
            `**${data.count}** catalogs found (page ${page}, ${size} per page)`,
            '',
            ...lines
          ].join('\n')
        } catch (err) {
          return agentToolError('Catalogs service unavailable', err)
        }
      }
    })

    useAgentTool({
      name: 'describe_catalog',
      description: 'Get detailed metadata for a catalog. Returns title, type, URL, owner, and configuration.',
      annotations: { title: t('describeCatalog'), readOnlyHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          catalogId: { type: 'string' as const, description: 'The exact catalog ID' }
        },
        required: ['catalogId'] as const
      },
      execute: async (params) => {
        try {
          const res = await fetch(`${catalogsBase}/${encodeURIComponent(params.catalogId)}`, { credentials: 'include' })
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
          const c = await res.json()

          const meta: string[] = [
            `# ${c.title}`,
            `- **ID:** \`${c._id}\``,
            `- **Type:** ${c.type || '?'}`,
            `- **Owner:** ${c.owner?.name || '?'}`
          ]
          if (c.url) meta.push(`- **URL:** ${c.url}`)
          if (c.description) meta.push(`- **Description:** ${c.description.length > 2000 ? c.description.slice(0, 2000) + '…' : c.description}`)
          if (c.updatedAt) meta.push(`- **Updated:** ${c.updatedAt}`)
          if (c.createdAt) meta.push(`- **Created:** ${c.createdAt}`)

          return meta.join('\n')
        } catch (err) {
          return agentToolError('Catalogs service unavailable', err)
        }
      }
    })
  }
}
