import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator, agentToolError, buildPaginatedQuery } from '~/composables/agent/utils'
import { formatApplicationConfig, getConfigValue, projectConfigSchema } from './agent-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    listApplications: 'Lister les applications',
    describeApplication: 'Décrire une application',
    listBaseApplications: 'Lister les modèles d\'application',
    getApplicationConfig: 'Lire la configuration de l\'application',
    getApplicationConfigSchema: 'Lire le schéma de configuration',
    getApplicationConfigDraft: 'Lire le brouillon de configuration'
  },
  en: {
    listApplications: 'List applications',
    describeApplication: 'Describe an application',
    listBaseApplications: 'List application models',
    getApplicationConfig: 'Read application configuration',
    getApplicationConfigSchema: 'Read the configuration schema',
    getApplicationConfigDraft: 'Read the configuration draft'
  }
}

function serializeApplicationInfo (app: any): string {
  const meta: string[] = [
    `# ${app.title}`,
    `- **ID:** \`${app.id}\``,
    `- **Status:** ${app.status || 'unknown'}`,
    `- **Owner:** ${app.owner?.name || '?'}`,
    `- **Visibility:** ${app.visibility || '?'}`
  ]
  if (app.slug) meta.push(`- **Slug:** ${app.slug}`)
  if (app.description) meta.push(`- **Description:** ${app.description.length > 2000 ? app.description.slice(0, 2000) + '…' : app.description}`)
  if (app.url) meta.push(`- **Application model URL:** ${app.url}`)
  if (app.baseApp) {
    meta.push(`- **Application model:** ${app.baseApp.title || app.baseApp.url || '?'}`)
    if (app.baseApp.version) meta.push(`- **Version:** ${app.baseApp.version}`)
  }
  if (app.topics?.length) meta.push(`- **Topics:** ${app.topics.map((t: any) => t.title).join(', ')}`)
  if (app.page) meta.push(`- **Link:** ${app.page}`)
  if (app.updatedAt) meta.push(`- **Updated:** ${app.updatedAt}`)
  if (app.createdAt) meta.push(`- **Created:** ${app.createdAt}`)

  if (app.configuration?.datasets?.length) {
    meta.push('')
    meta.push('## Configured datasets')
    for (const ds of app.configuration.datasets) {
      meta.push(`- ${ds.title || ds.id} (id: \`${ds.id}\`)`)
    }
  }

  return meta.join('\n')
}

// Fetch the config-schema.json of an application model. Cross-origin static file
// (koumoul.com / cdn.jsdelivr.net), so plain fetch rather than the API $fetch.
async function fetchConfigSchema (baseAppUrl: string): Promise<any> {
  const schemaUrl = baseAppUrl.replace(/\/?$/, '/') + 'config-schema.json'
  const res = await window.fetch(schemaUrl)
  if (!res.ok) throw new Error(`could not fetch ${schemaUrl} (${res.status})`)
  return res.json()
}

// Cache-buster: intermediate caches have been observed serving stale configurations,
// silently cancelling a previous write when the stale body was re-submitted.
const noCache = () => ({ _: `${Date.now()}${Math.floor(Math.random() * 1e6)}` })

export function useAgentApplicationTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'list_applications',
    description: 'List applications accessible to the current user with optional text search. Returns id, title, status, application model, and last update.',
    annotations: { title: t('listApplications'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string' as const, description: 'Optional text search keywords' },
        page: { type: 'number' as const, description: 'Page number (default 1)' },
        size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
      }
    },
    execute: async (params) => {
      const { query, page, size } = buildPaginatedQuery(params, { select: 'title,status,topics,updatedAt,url,baseApp' })

      const data = await $fetch<any>('applications', { query })

      const lines = data.results.map((a: any) => {
        const parts = [`- **${a.title || a.id}** (id: \`${a.id}\`)`,
          `  Status: ${a.status || 'unknown'}, updated ${a.updatedAt || '?'}`]
        if (a.baseApp?.title) parts.push(`  App model: ${a.baseApp.title}`)
        if (a.topics?.length) parts.push(`  Topics: ${a.topics.map((t: any) => t.title).join(', ')}`)
        return parts.join('\n')
      })

      return [
        `**${data.count}** applications found (page ${page}, ${size} per page)`,
        '',
        ...lines
      ].join('\n')
    }
  })

  useAgentTool({
    name: 'describe_application',
    description: 'Get detailed metadata for an application. Returns title, description, status, owner, application model info, configured datasets, and topics.',
    annotations: { title: t('describeApplication'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        applicationId: { type: 'string' as const, description: 'The exact application ID' }
      },
      required: ['applicationId'] as const
    },
    execute: async (params) => {
      const app = await $fetch<any>(`applications/${encodeURIComponent(params.applicationId)}`)
      return serializeApplicationInfo(app)
    }
  })

  useAgentTool({
    name: 'get_application_config',
    description: 'Get the current validated configuration of an application (the live config, not the editable draft). Returns compact JSON, truncated when large — pass "path" to read a sub-tree (e.g. "sections/0"). Read-only — configuration is changed from the application configuration page, where the appConfig_form subagent drives the form and the user validates the draft.',
    annotations: { title: t('getApplicationConfig'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        applicationId: { type: 'string' as const, description: 'The exact application ID' },
        path: { type: 'string' as const, description: 'Optional slash-separated data path into the configuration (e.g. "sections/0/elements")' }
      },
      required: ['applicationId'] as const
    },
    execute: async (params) => {
      let config: any
      try {
        config = await $fetch<any>(`applications/${encodeURIComponent(params.applicationId)}/configuration`, { query: noCache() })
      } catch {
        return 'This application is not configured yet.'
      }
      if (params.path) config = getConfigValue(config, params.path)
      return formatApplicationConfig(config)
    }
  })

  useAgentTool({
    name: 'get_application_config_schema',
    description: 'Get a compact listing of the JSON schema that governs an application\'s configuration: data paths, types, titles, required flags and allowed values. Call it before editing a configuration draft, and drill down with "path" (e.g. "sections/<i>/elements") since deep structures are elided. Pass applicationId for an existing application, or baseApplicationUrl (from list_base_applications) when the application does not exist yet.',
    annotations: { title: t('getApplicationConfigSchema'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        applicationId: { type: 'string' as const, description: 'The application ID (its application model provides the schema)' },
        baseApplicationUrl: { type: 'string' as const, description: 'The application model URL, as returned by list_base_applications — alternative to applicationId' },
        path: { type: 'string' as const, description: 'Optional slash-separated data path to a sub-schema (e.g. "sections/<i>" — use "<i>" or an index for array items)' }
      }
    },
    execute: async (params) => {
      try {
        let baseAppUrl = params.baseApplicationUrl
        if (!baseAppUrl && params.applicationId) {
          const app = await $fetch<any>(`applications/${encodeURIComponent(params.applicationId)}`, { query: { select: 'id,url,urlDraft' } })
          baseAppUrl = app.urlDraft || app.url
        }
        if (!baseAppUrl) return agentToolError('get_application_config_schema', 'pass applicationId or baseApplicationUrl')
        const schema = await fetchConfigSchema(baseAppUrl)
        return projectConfigSchema(schema, params.path)
      } catch (err) {
        return agentToolError('get_application_config_schema', err)
      }
    }
  })

  useAgentTool({
    name: 'get_application_config_draft',
    description: 'Get the editable configuration draft of an application. Returns compact JSON, truncated when large — pass "path" to read a sub-tree. The draft is edited from the application configuration page, where the appConfig_form subagent drives the form; the user then validates it.',
    annotations: { title: t('getApplicationConfigDraft'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        applicationId: { type: 'string' as const, description: 'The exact application ID' },
        path: { type: 'string' as const, description: 'Optional slash-separated data path into the draft (e.g. "sections/0")' }
      },
      required: ['applicationId'] as const
    },
    execute: async (params) => {
      try {
        let draft = await $fetch<any>(`applications/${encodeURIComponent(params.applicationId)}/configuration-draft`, { query: noCache() })
        if (params.path) draft = getConfigValue(draft, params.path)
        return formatApplicationConfig(draft)
      } catch (err) {
        return agentToolError('get_application_config_draft', err)
      }
    }
  })
  useAgentTool({
    name: 'list_base_applications',
    description: 'List available application models. Returns id, title, category, and URL.',
    annotations: { title: t('listBaseApplications'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        q: { type: 'string' as const, description: 'Optional text search keywords' },
        page: { type: 'number' as const, description: 'Page number (default 1)' },
        size: { type: 'number' as const, description: 'Page size (default 10, max 50)' }
      }
    },
    execute: async (params) => {
      const { query, page, size } = buildPaginatedQuery(params)

      const data = await $fetch<any>('base-applications', { query })

      const lines = data.results.map((ba: any) => {
        const parts = [`- **${ba.title || ba.id}** (id: \`${ba.id}\`)`]
        if (ba.category) parts.push(`  Category: ${ba.category}`)
        if (ba.description) parts.push(`  ${ba.description.length > 200 ? ba.description.slice(0, 200) + '…' : ba.description}`)
        if (ba.url) parts.push(`  URL: ${ba.url}`)
        return parts.join('\n')
      })

      return [
        `**${data.count}** application models found (page ${page}, ${size} per page)`,
        '',
        ...lines
      ].join('\n')
    }
  })
}
