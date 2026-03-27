import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    listApplications: 'Lister les applications',
    describeApplication: 'Décrire une application',
    listBaseApplications: 'Lister les modèles d\'application'
  },
  en: {
    listApplications: 'List applications',
    describeApplication: 'Describe an application',
    listBaseApplications: 'List base applications'
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
  if (app.url) meta.push(`- **Base application URL:** ${app.url}`)
  if (app.baseApp) {
    meta.push(`- **Base application:** ${app.baseApp.title || app.baseApp.url || '?'}`)
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

export function useAgentApplicationTools (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'list_applications',
    description: 'List applications accessible to the current user with optional text search. Returns id, title, status, base application, and last update.',
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
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      const page = Math.max(params.page || 1, 1)
      const query: Record<string, string> = {
        select: 'title,status,topics,updatedAt,url,baseApp',
        size: String(size),
        page: String(page)
      }
      if (params.q) query.q = params.q

      const data = await $fetch<any>('applications', { query })

      const lines = data.results.map((a: any) => {
        const parts = [`- **${a.title || a.id}** (id: \`${a.id}\`)`,
          `  Status: ${a.status || 'unknown'}, updated ${a.updatedAt || '?'}`]
        if (a.baseApp?.title) parts.push(`  Base app: ${a.baseApp.title}`)
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
    description: 'Get detailed metadata for an application. Returns title, description, status, owner, base application info, configured datasets, and topics.',
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
    name: 'list_base_applications',
    description: 'List available base application templates (models). Returns id, title, category, and URL.',
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
      const size = Math.min(Math.max(params.size || 10, 1), 50)
      const page = Math.max(params.page || 1, 1)
      const query: Record<string, string> = {
        size: String(size),
        page: String(page)
      }
      if (params.q) query.q = params.q

      const data = await $fetch<any>('base-applications', { query })

      const lines = data.results.map((ba: any) => {
        const parts = [`- **${ba.title || ba.id}** (id: \`${ba.id}\`)`]
        if (ba.category) parts.push(`  Category: ${ba.category}`)
        if (ba.description) parts.push(`  ${ba.description.length > 200 ? ba.description.slice(0, 200) + '…' : ba.description}`)
        if (ba.url) parts.push(`  URL: ${ba.url}`)
        return parts.join('\n')
      })

      return [
        `**${data.count}** base applications found (page ${page}, ${size} per page)`,
        '',
        ...lines
      ].join('\n')
    }
  })
}
