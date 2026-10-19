// The platform OpenAPI document: every service's document (a fragment) rewritten into its own
// namespace, then merged into one document per site. Pure: the fragments are fetched and cached
// elsewhere, this module only checks, rewrites and merges them.
// Design: docs/superpowers/specs/2026-10-19-platform-api-docs-design.md
import type { AgentSkill, Localized } from '@data-fair/openapi-mcp'

export type PlatformServiceId = 'datafair' | 'sd' | 'metrics'

export interface PlatformService {
  id: PlatformServiceId
  title: string
  /** prefix of the service's paths on the site */
  mountPath: string
  /** public path of its document on the site, skill hrefs resolve against it */
  docPath: string
}

export interface PreparedFragment {
  service: PlatformService
  /** prefixed, operationIds/x-agent/tags/$refs/security rewritten */
  paths: Record<string, any>
  /** without securitySchemes, names namespaced */
  components: Record<string, Record<string, any>>
  tags: { name: string, description?: string }[]
  /** namespaced name/tools, href still relative */
  skills: AgentSkill[]
  /** from its oauth2 scheme, {} when none */
  scopes: Record<string, string>
  warnings: string[]
}

export interface FragmentState {
  service: PlatformService
  fragment?: PreparedFragment
  status: 'ok' | 'stale' | 'error' | 'refused'
  error?: string
  fetchedAt?: string
}

/** the security schemes shared by name across services, as data-fair declares them */
export const sharedSecuritySchemes = {
  apiKey: { type: 'apiKey', in: 'header', name: 'x-apiKey' },
  sdCookie: { type: 'apiKey', in: 'cookie', name: 'id_token' }
} as const

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

/** same as openapi-mcp's snakeCase (a dev dependency here, not importable at runtime) */
export const snakeCase = (s: string) => s
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/_+/g, '_')
  .toLowerCase()

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

const operationsOf = (paths: Record<string, any>) => {
  const operations: { path: string, method: string, op: any }[] = []
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue
    for (const method of httpMethods) {
      if (isObject(item[method])) operations.push({ path, method, op: item[method] })
    }
  }
  return operations
}

const agentEntries = (op: any): Record<string, any>[] => {
  const xAgent = op['x-agent']
  if (Array.isArray(xAgent)) return xAgent.filter(isObject)
  return isObject(xAgent) ? [xAgent] : []
}

/** rewrites every internal component $ref of a value, security schemes excepted */
const rewriteRefs = (value: any, ns: string): void => {
  if (Array.isArray(value)) {
    for (const item of value) rewriteRefs(item, ns)
    return
  }
  if (!isObject(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      const match = child.match(/^#\/components\/([^/]+)\/([^/]+)(.*)$/)
      if (match && match[1] !== 'securitySchemes') value[key] = `#/components/${match[1]}/${ns}_${match[2]}${match[3]}`
    } else {
      rewriteRefs(child, ns)
    }
  }
}

const sameScheme = (a: any, b: Record<string, string>) =>
  isObject(a) && a.type === b.type && a.in === b.in && a.name === b.name

/** checks the security schemes of a fragment, returns its declared scopes or a refusal */
const checkSecuritySchemes = (schemes: Record<string, any>, warnings: string[]): { scopes: Record<string, string> } | { refused: string } => {
  let scopes: Record<string, string> = {}
  for (const [name, scheme] of Object.entries(schemes)) {
    if (name === 'apiKey' || name === 'sdCookie') {
      if (!sameScheme(scheme, sharedSecuritySchemes[name])) return { refused: `security scheme ${name} differs from the platform's definition` }
    } else if (name === 'oauth2' || scheme?.type === 'oauth2') {
      if (name !== 'oauth2') return { refused: `oauth2 security scheme declared under another name: ${name}` }
      if (scheme?.type !== 'oauth2') return { refused: 'security scheme oauth2 is not of type oauth2' }
      const flows = Object.keys(scheme.flows ?? {})
      if (flows.length !== 1 || flows[0] !== 'clientCredentials') return { refused: `oauth2 flows must be clientCredentials only, got ${flows.join(', ') || 'none'}` }
      scopes = { ...(scheme.flows.clientCredentials.scopes ?? {}) }
    } else {
      warnings.push(`security scheme ${name} is not part of the platform document`)
    }
  }
  return { scopes }
}

const undeclaredScope = (security: unknown, scopes: Record<string, string>): string | undefined => {
  if (!Array.isArray(security)) return
  for (const requirement of security) {
    for (const scope of (isObject(requirement) && Array.isArray(requirement.oauth2)) ? requirement.oauth2 : []) {
      if (!(scope in scopes)) return scope
    }
  }
}

const namespaceSkill = (ns: string, skill: AgentSkill): AgentSkill => {
  const { profiles, ...rest } = skill as AgentSkill & { profiles?: unknown }
  return {
    ...rest,
    name: `${ns}-${skill.name}`,
    ...(skill.tools ? { tools: skill.tools.map(tool => `${ns}_${tool}`) } : {})
  }
}

export function prepareFragment (service: PlatformService, sourceDoc: any): { fragment: PreparedFragment } | { refused: string } {
  if (!isObject(sourceDoc) || typeof sourceDoc.openapi !== 'string' || !/^3\.[01]\./.test(sourceDoc.openapi) || !isObject(sourceDoc.paths)) {
    return { refused: 'not an OpenAPI 3.0 or 3.1 document with paths' }
  }
  // a copy: the source may share module level objects (data-fair's own document does)
  const doc = structuredClone(sourceDoc)
  const ns = service.id
  const warnings: string[] = []

  const schemesCheck = checkSecuritySchemes(isObject(doc.components?.securitySchemes) ? doc.components.securitySchemes : {}, warnings)
  if ('refused' in schemesCheck) return schemesCheck
  const { scopes } = schemesCheck

  const operations = operationsOf(doc.paths)

  // duplicate operationIds: the first keeps it, later ones lose it, unless one of them is a tool
  const byId = new Map<string, typeof operations>()
  for (const entry of operations) {
    const id = entry.op.operationId
    if (typeof id !== 'string') continue
    byId.set(id, [...(byId.get(id) ?? []), entry])
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue
    if (group.some(({ op }) => op['x-agent'] !== undefined)) return { refused: `duplicate operationId ${id} on an operation with x-agent` }
    for (const { path, method, op } of group.slice(1)) {
      delete op.operationId
      warnings.push(`duplicate operationId ${id} on ${method.toUpperCase()} ${path}`)
    }
  }

  const rootSecurity = doc.security
  for (const { path, method, op } of operations) {
    // every operation carries an explicit security, failing closed when none is declared anywhere
    if (op.security === undefined) op.security = rootSecurity !== undefined ? structuredClone(rootSecurity) : [{ sdCookie: [] }]
    const entries = agentEntries(op)
    for (const security of [op.security, ...entries.map(entry => entry.security)]) {
      const scope = undeclaredScope(security, scopes)
      if (scope) return { refused: `${method.toUpperCase()} ${path} requires the scope ${scope} that its oauth2 scheme does not declare` }
    }

    const operationId = op.operationId
    for (const entry of entries) {
      delete entry.profiles
      delete entry.namePrefix
      const name = entry.name ?? (typeof operationId === 'string' ? snakeCase(operationId) : undefined)
      if (name) entry.name = `${ns}_${name}`
      else warnings.push(`x-agent without name nor operationId on ${method.toUpperCase()} ${path}`)
    }
    if (typeof operationId === 'string') op.operationId = `${ns}_${operationId}`
    if (Array.isArray(op.tags)) op.tags = op.tags.map((tag: string) => `${service.title} / ${tag}`)
  }

  rewriteRefs(doc.paths, ns)
  const components: Record<string, Record<string, any>> = {}
  for (const [kind, items] of Object.entries(doc.components ?? {})) {
    if (kind === 'securitySchemes' || !isObject(items)) continue
    rewriteRefs(items, ns)
    components[kind] = Object.fromEntries(Object.entries(items).map(([name, item]) => [`${ns}_${name}`, item]))
  }

  const paths = Object.fromEntries(Object.entries(doc.paths).map(([path, item]) => [service.mountPath + path, item]))
  const tags = (Array.isArray(doc.tags) ? doc.tags : []).filter(isObject).map((tag: any) => ({ ...tag, name: `${service.title} / ${tag.name}` }))
  const skills = (Array.isArray(doc['x-agent']?.skills) ? doc['x-agent'].skills : []).map((skill: AgentSkill) => namespaceSkill(ns, skill))

  return { fragment: { service, paths, components, tags, skills, scopes, warnings } }
}

const resolveHref = (href: Localized, base: string): Localized => typeof href === 'string'
  ? new URL(href, base).href
  : Object.fromEntries(Object.entries(href).map(([lang, value]) => [lang, new URL(value, base).href]))

export function mergePlatformDoc (siteOrigin: string, states: FragmentState[], info: { version: string, oauth2Description: string }): any {
  const paths: Record<string, any> = {}
  const components: Record<string, Record<string, any>> = {}
  const tags: { name: string, description?: string }[] = []
  const skills: AgentSkill[] = []
  const scopes: Record<string, string> = {}
  const services: Record<string, any>[] = []

  for (const { service, fragment, status, error, fetchedAt } of states) {
    services.push({
      id: service.id,
      status,
      ...(error !== undefined ? { error } : {}),
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
      ...(fragment?.warnings.length ? { warnings: fragment.warnings } : {})
    })
    if (!fragment) continue
    Object.assign(paths, fragment.paths)
    for (const [kind, items] of Object.entries(fragment.components)) components[kind] = { ...components[kind], ...items }
    tags.push(...fragment.tags)
    const base = siteOrigin + service.docPath
    skills.push(...fragment.skills.map(skill => skill.href === undefined ? skill : { ...skill, href: resolveHref(skill.href, base) }))
    Object.assign(scopes, fragment.scopes)
  }

  return {
    openapi: '3.1.0',
    info: { title: 'API de la plateforme Data Fair', version: info.version },
    servers: [{ url: siteOrigin }],
    'x-agent': { skills },
    'x-platform': { services },
    tags,
    components: {
      ...components,
      securitySchemes: {
        ...sharedSecuritySchemes,
        oauth2: {
          type: 'oauth2',
          description: info.oauth2Description,
          flows: {
            clientCredentials: { tokenUrl: `${siteOrigin}/simple-directory/api/auth/nhi-token`, scopes }
          }
        }
      }
    },
    paths
  }
}
