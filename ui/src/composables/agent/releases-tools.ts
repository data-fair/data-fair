import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, agentToolError } from './utils'
import { validateGithubPath, truncateBody, serializeServicesInfo, type ServiceInfo } from './releases-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    listServicesVersions: 'Lister les versions des services',
    exploreGithub: "Explorer l'API GitHub"
  },
  en: {
    listServicesVersions: 'List services versions',
    exploreGithub: 'Explore GitHub API'
  }
}

export function useAgentServicesInfoTool (locale: Ref<string>, services: Ref<ServiceInfo[]>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'list_services_versions',
    description: 'List the Data Fair platform services running on this instance with their currently installed version, git commit and build date. Each service `name` is also its GitHub repository slug ("owner/repo", e.g. "data-fair/data-fair") and can be passed directly to explore_github. Use this first to know which version is deployed before comparing with available releases.',
    annotations: { title: t('listServicesVersions'), readOnlyHint: true },
    inputSchema: { type: 'object' as const, properties: {} },
    execute: async () => serializeServicesInfo(services.value)
  })
}

export function useAgentGithubTool (locale: Ref<string>) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'explore_github',
    description: [
      'Perform an unauthenticated GET request against the public GitHub REST API. Restricted to "/repos/..." paths.',
      'Useful endpoints for service releases:',
      '- /repos/{owner}/{repo}/releases?per_page=10 — recent releases with notes (newest first)',
      '- /repos/{owner}/{repo}/releases/latest — latest non-prerelease release',
      '- /repos/{owner}/{repo}/tags?per_page=10 — git tags; use as a FALLBACK when a repo has no GitHub releases (the "available version" shown on this page is read from tags)',
      '- /repos/{owner}/{repo}/compare/{base}...{head} — diff between two tags/commits',
      'Pass owner/repo from list_services_versions. Keep per_page small. Large responses are truncated. Unauthenticated rate limit is 60 requests/hour.'
    ].join('\n'),
    annotations: { title: t('exploreGithub'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'GitHub API path starting with "/repos/", e.g. "/repos/data-fair/data-fair/releases"' },
        query: { type: 'string' as const, description: 'Optional query string without leading "?", e.g. "per_page=10"' }
      },
      required: ['path'] as const
    },
    execute: async (params) => {
      const path = params.path as string
      const valid = validateGithubPath(path)
      if (!valid.ok) {
        return { content: [{ type: 'text' as const, text: valid.message }], isError: true }
      }
      try {
        const url = `https://api.github.com${path}${params.query ? '?' + (params.query as string) : ''}`
        const res = await fetch(url, {
          credentials: 'omit',
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        })
        if (!res.ok) {
          if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
            return { content: [{ type: 'text' as const, text: 'GitHub rate limit reached (unauthenticated, 60 requests/hour). Try again later.' }], isError: true }
          }
          if (res.status === 404) {
            return { content: [{ type: 'text' as const, text: `Not found: ${path}` }], isError: true }
          }
          const body = await res.text()
          return { content: [{ type: 'text' as const, text: `HTTP ${res.status}: ${truncateBody(body, 500).text}` }], isError: true }
        }
        const body = await res.text()
        const { text, truncated } = truncateBody(body)
        return text + (truncated ? '\n\n…(response truncated)' : '')
      } catch (err) {
        return agentToolError('GitHub API request failed', err)
      }
    }
  })
}
