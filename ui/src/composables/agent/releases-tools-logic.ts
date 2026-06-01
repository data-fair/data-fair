export interface ServiceInfo {
  name: string
  loaded?: boolean
  error?: string
  commit?: string
  date?: string
  version?: string
}

/**
 * Validate a GitHub REST API path for the explore_github tool.
 * Only unauthenticated GET access to "/repos/..." is allowed.
 */
export function validateGithubPath (path: string): { ok: true } | { ok: false, message: string } {
  if (typeof path !== 'string' || !path.startsWith('/repos/')) {
    return { ok: false, message: 'path must start with "/repos/" — only the GitHub /repos/... API is allowed' }
  }
  if (path.startsWith('//') || path.includes('://') || path.includes('..')) {
    return { ok: false, message: 'invalid path' }
  }
  return { ok: true }
}

/**
 * Truncate a (possibly large) response body to a character budget.
 */
export function truncateBody (text: string, max = 10_000): { text: string, truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

/**
 * Serialize the /admin/info services list into a markdown summary for the agent.
 * Each service `name` doubles as its GitHub repo slug ("owner/repo").
 */
export function serializeServicesInfo (services: ServiceInfo[]): string {
  if (!services.length) return 'No services configured.'
  const lines = services.map((s) => {
    if (s.error) return `- **${s.name}**: error loading info (${s.error})`
    if (!s.loaded) return `- **${s.name}**: loading…`
    const parts = [`installed version: ${s.version ?? 'unknown'}`]
    if (s.commit) parts.push(`commit: ${s.commit}`)
    if (s.date) parts.push(`date: ${s.date}`)
    return `- **${s.name}** (GitHub repo: ${s.name}) — ${parts.join(', ')}`
  })
  return ['Data Fair services and their currently installed versions:', '', ...lines].join('\n')
}
